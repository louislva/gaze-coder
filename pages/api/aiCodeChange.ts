// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
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
  res: NextApiResponse
) {
  console.log(req.body);

  const { value, command, gazedCode } = JSON.parse(req.body);

  const result = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k-0613",
    messages: [
      {
        role: "system",
        content:
          "You are an AI coder. The user gives you a JavaScript file & a change you need to make to it. You then make the changes, and save them to the file. You must never make changes the user didn't explicitly ask for.",
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
    ],
    max_tokens: 6500,
  });
  if (result.data.choices[0].message?.function_call) {
    switch (result.data.choices[0].message?.function_call.name) {
      case "saveCodeToFile":
        try {
          const updatedCode = JSON.parse(
            result.data.choices[0].message.function_call.arguments!
          ).code;
          return res.status(200).json({ updatedCode });
        } catch (error) {
          console.error(
            "Fuck it",
            result.data.choices[0].message.function_call.arguments
          );
        }
      default:
        break;
    }
  }

  return res.status(500).end();
}
