// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { ActionType } from "@/components/CodeEditor";
import writeCode from "@/helpers/writeCode";
import type { NextApiRequest, NextApiResponse } from "next";

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ActionType>
) {
  const { value, versionHistory, clipboard, command, gazedCode } = JSON.parse(
    req.body
  );

  let action: ActionType = { type: "none", payload: null };
  await retryOnException(async () => {
    const { summary, updated } = await writeCode(
      value,
      command,
      gazedCode,
      clipboard
    );

    action.type = "updateCode";
    action.payload = updated;
    action.summary = summary;

    console.log(
      "TESTCASE: ",
      JSON.stringify({
        value,
        command,
        gazedCode,
        clipboard,
        updated,
        summary,
      })
    );
  }, 1);

  return res.status(200).json(action);
}
