import { Configuration, OpenAIApi } from "openai";
import { expect as _expect } from "@jest/globals";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const DEBUG = false;
// const MODEL = "gpt-4-0613";
const MODEL = "gpt-3.5-turbo-0613";

async function getLLMGrade(
  received: string,
  expected: string,
  testName?: string,
  task?: string
) {
  const SYSTEM = `You are an AI grader. You are presented with an expert answer, and then a student answer to the same task.${
    task
      ? " The task is not provided, but do your best to infer from the context what it might be."
      : ""
  }

You grade the student responses on a scale of:
- \`Bad\`: the response is lacking compared to the expert answer
- \`Good\`: the response covers all important aspects in the same manner as the expert

Please respond with <reasoning></reasoning> tags where you think about how to grade the response, and then finally a <grade></grade> tag which contains: Bad / Good`;

  const user =
    (testName ? `<testName>${testName}</testName>\n` : "") +
    (task ? `<task>\n${task}\n</task>\n` : "") +
    `<expert>
${expected}
</expert>
<student>
${received}
</student>`;

  const result = await openai.createChatCompletion({
    model: MODEL,
    temperature: 0.0,
    max_tokens: 384,
    messages: [
      {
        role: "system",
        content: SYSTEM,
      },
      {
        role: "user",
        content: user,
      },
    ],
  });
  const responseMessage = result.data.choices[0].message!.content!;
  DEBUG && console.log(responseMessage);

  if (
    !responseMessage.includes("<grade>Good</grade>") &&
    !responseMessage.includes("<grade>Bad</grade>")
  ) {
    // TODO: retries, but shouldn't fuck up entire test pipeline on one mistake
    throw new Error(
      "The response does not contain either <grade>Bad</grade> or <grade>Good</grade>"
    );
  } else {
    const isAsGoodAs = responseMessage.includes("<grade>Good</grade>");
    // TODO: cache response

    return isAsGoodAs;
  }
}

_expect.extend({
  toBeAsGoodAs: async (received: string, expected: string, task?: string) => {
    const { currentTestName } = _expect.getState();
    const isPassing = await getLLMGrade(
      received,
      expected,
      currentTestName,
      task
    );
    return {
      pass: isPassing,
      message: () =>
        `The LLM grader deemed that:\n\n${"```"}\n${received}\n${"```"}\n\n Was not similar enough to the expert-annotated answer:\n\n${"```"}\n${expected}\n${"```"}`,
    };
  },
});

export const expect = _expect as unknown as {
  <T = unknown>(actual: T): {
    toBeAsGoodAs(expected: string, task?: string): void;
  } & ReturnType<typeof _expect>;
} & typeof _expect;
