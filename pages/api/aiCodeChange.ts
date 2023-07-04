// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { ActionType } from "@/components/CodeEditor";
import type { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";
import * as Diff from "diff";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function retryOnException(
  fn: () => Promise<any>,
  tries: number = 3
): Promise<any> {
  const MIN_WAIT_TIME = 4500;
  const startTimestamp = Date.now();
  return fn().catch((error) => {
    console.error("Caught and retrying this error:", error);
    if (tries > 1) {
      return wait(
        Math.max(0, MIN_WAIT_TIME - (Date.now() - startTimestamp))
      ).then(() => retryOnException(fn, tries - 1));
    }
  });
}

function stripFullStopEnding(text: string): string {
  return text.trim().replace(/[.,]$/, "");
}
function stripTranscription(transcription: string): string {
  return stripFullStopEnding(transcription.trim().replace(/\n/g, " "));
}

// GPT-3.5 sometimes replaces \\n with \n, so we have to just beware & undo that
function undoUnescapeNewline(before: string, after: string): string {
  // Get diff
  const diff = Diff.diffChars(before, after);

  // Find each diff to undo
  let pos = 0;
  for (let i = 0; i < diff.length - 1; i++) {
    const current = diff[i];
    const next = diff[i + 1];

    if (
      current.removed &&
      next.added &&
      current.value === "\\n" &&
      next.value === "\n"
    ) {
      // UNDO diff
      next.value = current.value;
      console.log("UNDID DIFF!");
    }
  }

  // Reconstruct b from the diff
  return diff
    .filter((d) => !d.removed)
    .map((d) => d.value)
    .join("");
}

async function getIsPasteCommand(command: string): Promise<boolean | null> {
  const prompt =
    'Does the following sentence refer to copy / pasting *AT ALL*? (dump, clipboard, paste, "put it", all count as synonyms)\n\n```\n' +
    command.replace("Taste", "Paste").replace("taste", "paste") +
    "\n```";

  const result = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    temperature: 0,
    max_tokens: 1,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const answer = result.data.choices[0].message?.content
    ?.toLowerCase()
    .includes("yes");

  return answer ?? null;
}
async function getIsUndoCommand(command: string): Promise<boolean> {
  return command.length < 40 && command.toLowerCase().includes("undo");
}

const NON_FUNCTION_SYSTEM_PROMPT = `You are an AI programmer assistant.

The user sends a message in the following format:

ORIGINAL CODE DOCUMENT:
${"```"}
[code]
${"```"}
REQUEST: [the user's request of you]
USER WAS LOOKING AT:
${"```"}
[A snippet of code the user was hovering over. This may or may not be useful info]
${"```"}

The assistant (you) then respond in the following format:

[Description of how you understood the task & what you're going to do]
CHANGED CODE DOCUMENT:
${"```"}
[all of the exact same code, but with the requested change]
${"```"}
SUMMARY: [A very short summary of the change; e.g. "Add a green button"]

If the user says "that" or "this", they're probably referring to the part inside of "USER WAS LOOKING AT"`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActionType>
) {
  const { value, versionHistory, clipboard, command, gazedCode } = JSON.parse(
    req.body
  );

  let action: ActionType = { type: "none", payload: null };
  await retryOnException(async () => {
    // SYSTEM PROMPT
    const systemPrompt = `You are a JavaScript programmer.

The user gives you a JavaScript file & a request for you.

You then make the requested changes, and save them to the file.

Remember:
+ When you save the file, you overwrite everything inside of it.
+ So make sure to keep all the old lines of code that have not changed.
+ You must never make changes the user didn't explicitly ask for.`;

    // USER PROMPT
    const isPasteCommand = await getIsPasteCommand(command);
    const mainPrompt =
      "Here is the JavaScript file:\n\n```\n" +
      value +
      '\n```\n\nThe requested change is: "' +
      stripTranscription(command) +
      '"';
    const pastePrompt =
      isPasteCommand && clipboard
        ? "\n\nP.S. here is the content of the user's clipboard, in case it's useful:\n\n```\n" +
          clipboard +
          "\n```"
        : "";
    const gazePrompt = gazedCode
      ? "\n\nAlso, the user was looking at this part of the code, but I don't know if that's relevant for you to know:\n\n```\n" +
        gazedCode +
        "\n```"
      : "";
    const userPrompt = mainPrompt + pastePrompt + gazePrompt;
    console.log("userPrompt:", userPrompt);

    // CALL GPT-3.5
    const isPromptLong = (systemPrompt.length + userPrompt.length) / 4 > 2000;

    const result = await openai.createChatCompletion({
      // model: isPromptLong ? "gpt-3.5-turbo-16k-0613" : "gpt-3.5-turbo-0613",
      model: "gpt-4-0613",
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      functions: [
        // {
        //   name: "findAndReplace",
        //   description:
        //     "For small changes where you want to edit a few lines, it can be easier to simply do a find & replace. Parameters must be valid JSON",
        //   parameters: {
        //     type: "object",
        //     properties: {
        //       find: {
        //         type: "string",
        //         description: "The code to find",
        //       },
        //       replace: {
        //         type: "string",
        //         description: "The code to replace it with",
        //       },
        //       summary: {
        //         type: "string",
        //         description: "A one sentence description of the change.",
        //       },
        //     },
        //     required: ["code"],
        //   },
        // },
        {
          name: "saveCodeToFile",
          description:
            "Overwrites the file with the new, modified code. Parameters must be valid JSON",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The code to write the file.",
              },
              summary: {
                type: "string",
                description: "A one sentence description of the change.",
              },
            },
            required: ["code"],
          },
        },
        {
          name: "undo",
          description: "Undo the last change a user made.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],
      max_tokens: isPromptLong ? 6500 : 1800,
    });
    if (result.data.choices[0].message?.function_call) {
      switch (result.data.choices[0].message?.function_call.name) {
        case "findAndReplace": {
          const find = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).find;
          const replace = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).replace;
          if (!value.includes(find)) {
            throw new Error(
              "Could not find the string GPT-3 was searching for."
            );
          }
          const updatedCode = value.replace(find, replace);
          const summary = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).summary;
          action = {
            type: "updateCode",
            payload: updatedCode,
            summary: stripFullStopEnding(summary),
          };
          break;
        }
        case "saveCodeToFile": {
          const updatedCode = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).code;
          const summary = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).summary;
          action = {
            type: "updateCode",
            payload: undoUnescapeNewline(value, updatedCode),
            summary: stripFullStopEnding(summary),
          };
          break;
        }
        case "undo": {
          action = { type: "undo", payload: null };
          break;
        }
        default: {
          action = {
            type: "none",
            payload: result.data.choices[0].message.content,
          };
          break;
        }
      }
    }
  });

  return res.status(200).json(action);
}
