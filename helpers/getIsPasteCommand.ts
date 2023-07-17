import openai from "./openai";

export default async function getIsPasteCommand(
  command: string
): Promise<boolean | null> {
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
