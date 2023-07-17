import * as Diff from "diff";
import { WriteCodeOutput } from "../writeCode";
import getIsPasteCommand from "../getIsPasteCommand";
import stripTranscription, { stripFullStopEnding } from "../stripTranscription";
import openai from "../openai";

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

export default async function writeCodeOAFunctions(
  original: string,
  change: string,
  gazedCode?: string,
  clipboard?: string
): Promise<WriteCodeOutput> {
  // SYSTEM PROMPT
  const systemPrompt = `You are a JavaScript programmer.

The user gives you a JavaScript file & a request for you.

You then make the requested changes, and save them to the file.

Remember:
+ When you save the file, you overwrite everything inside of it.
+ So make sure to keep all the old lines of code that have not changed.
+ You must never make changes the user didn't explicitly ask for.`;

  // USER PROMPT
  const isPasteCommand = await getIsPasteCommand(change);
  const mainPrompt =
    "Here is the JavaScript file:\n\n```\n" +
    original +
    '\n```\n\nThe requested change is: "' +
    stripTranscription(change) +
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
      case "saveCodeToFile": {
        const updatedCode = JSON.parse(
          result.data.choices[0].message.function_call.arguments!
        ).code;
        const summary = JSON.parse(
          result.data.choices[0].message.function_call.arguments!
        ).summary;
        return {
          updated: undoUnescapeNewline(original, updatedCode),
          summary: summary && stripFullStopEnding(summary),
        };
      }
      case "undo": {
        // action = { type: "undo", payload: null };
        // break;
        throw new Error("NOT IMPLEMENTED: undo");
      }
      default: {
        // action = {
        //   type: "none",
        //   payload: result.data.choices[0].message.content,
        // };
        // break;
        throw new Error("NOT IMPLEMENTED: default"); // Actually, this is genuinely an error
      }
    }
  } else {
    throw new Error("GPT-4 didn't call any function");
  }
}
