import getIsPasteCommand from "@/helpers/getIsPasteCommand";
import openai from "@/helpers/openai";
import { WriteCodeOutput } from "../writeCode";
import stripTranscription from "../stripTranscription";

export default async function writeCodeTwoStep(
  original: string,
  change: string,
  gazedCode?: string,
  clipboard?: string
): Promise<WriteCodeOutput> {
  const isPasteCommand = await getIsPasteCommand(change);
  // SYSTEM PROMPT^
  const systemPromptThink = `You are a JavaScript programmer.

The user gives you a JavaScript file & a request for you.
^
Please respond with what the user should change. Only respond with the changes, not the complete file.`;

  const systemPromptWrite = `You are a JavaScript programmer. Based on a conversation, you rewrite the user's file with the requested changes. Please only output the rewritten file. Don't wrap code in ${"```"}`;
  const userPromptWrite =
    "Please give me the complete rewritten document with this change, and nothing else. Don't wrap the code in ``` or reply anything else than the rewritten file.";

  const systemPromptSummary = ``;
  const userPromptSummary =
    "Please summarize the changes in one short sentence. Please don't respond with anything else than the summary. It should be no longer than one sentence.";

  const mainPrompt =
    "Here is the current JavaScript file:\n\n```\n" +
    original +
    '\n```\n\nThe requested change is: "' +
    stripTranscription(change) +
    '"';
  const gazePrompt = gazedCode
    ? "\n\nAlso, the user was looking at this part of the code, but I don't know if that's relevant for you to know:\n\n```\n" +
      gazedCode +
      "\n```"
    : "";
  const pastePrompt =
    isPasteCommand && clipboard
      ? "\n\nP.S. here is the content of the user's clipboard, in case it's useful:\n\n```\n" +
        clipboard +
        "\n```"
      : "";
  const userPrompt = mainPrompt + pastePrompt + gazePrompt;
  console.log("userPrompt:", userPrompt);

  const resultThink = await openai.createChatCompletion({
    model: "gpt-4-0613",
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: systemPromptThink,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    max_tokens: Math.floor(
      4096 - (systemPromptThink.length + userPrompt.length) / 4 - 500
    ),
  });
  console.log("resultThink:", resultThink.data.choices[0].message!.content!);

  const resultWrite = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k-0613",
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: systemPromptWrite,
      },
      {
        role: "user",
        content: userPrompt,
      },
      {
        role: "assistant",
        content: resultThink.data.choices[0].message!.content!,
      },
      {
        role: "user",
        content: userPromptWrite,
      },
    ],
  });
  console.log("inputWrite:", [
    {
      role: "system",
      content: systemPromptWrite,
    },
    {
      role: "user",
      content: userPrompt,
    },
    {
      role: "assistant",
      content: resultThink.data.choices[0].message!.content!,
    },
    {
      role: "user",
      content: userPromptWrite,
    },
  ]);

  console.log("resultWrite:", resultWrite.data.choices[0].message!.content!);

  const resultSummary = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k-0613",
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: systemPromptSummary,
      },
      {
        role: "user",
        content: userPrompt,
      },
      {
        role: "assistant",
        content: resultThink.data.choices[0].message!.content!,
      },
      {
        role: "user",
        content: userPromptSummary,
      },
    ],
  });
  console.log(
    "resultSummary:",
    resultSummary.data.choices[0].message!.content!
  );

  return {
    updated: resultWrite.data.choices[0].message!.content!,
    summary: resultSummary.data.choices[0].message!.content!,
  };
}
