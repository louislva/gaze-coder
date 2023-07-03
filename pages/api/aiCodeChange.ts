// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { ActionType } from "@/components/CodeEditor";
import type { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

function stripTranscription(transcription: string): string {
  return transcription.trim().replace(/\n/g, " ");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActionType>
) {
  console.log(req.body);

  const { value, versionHistory, command, gazedCode } = JSON.parse(req.body);

  const SYSTEM_PROMPT = `You are a JavaScript programmer.

The user gives you a JavaScript file & a request for you.

You then make the requested changes, and save them to the file.

Remember:
+ When you save the file, you overwrite everything inside of it.
+ So make sure to keep all the old lines of code that have not changed.
+ You must never make changes the user didn't explicitly ask for.`;
  const result = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k-0613",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content:
          "Here is the JavaScript file:\n\n```\n" +
          value +
          '\n```\n\nThe requested change is: "' +
          stripTranscription(command) +
          '"',
      },
    ],
    // function_call: {
    //   name: "saveCodeToFile",
    // },
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
        return res
          .status(200)
          .json({ type: "updateCode", payload: updatedCode });
      case "undo":
        return res.status(200).json({ type: "undo", payload: null });
      default:
        break;
    }
  }

  return res.status(200).json({ type: "none", payload: null });
}
