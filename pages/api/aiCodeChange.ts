// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { ActionType } from "@/components/CodeEditor";
import type { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

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
    if (tries > 1) {
      return wait(
        Math.max(0, MIN_WAIT_TIME - (Date.now() - startTimestamp))
      ).then(() => retryOnException(fn, tries - 1));
    }
  });
}

function stripTranscription(transcription: string): string {
  return transcription.trim().replace(/\n/g, " ");
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
    const result = await openai.createChatCompletion({
      // model: "gpt-3.5-turbo-16k-0613",
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
      max_tokens: 6500,
    });
    if (result.data.choices[0].message?.function_call) {
      switch (result.data.choices[0].message?.function_call.name) {
        case "saveCodeToFile":
          const updatedCode = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).code;
          action = { type: "updateCode", payload: updatedCode };
          break;
        case "undo":
          action = { type: "undo", payload: null };
          break;
        default:
          break;
      }
    }
  });

  console.log(action);
  return res.status(200).json(action);
}
