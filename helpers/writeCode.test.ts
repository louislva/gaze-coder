// Jest
import { writeCodeTwoStep, writeCodeOAFunctions } from "@/helpers/writeCode";
import { describe, test } from "@jest/globals";
import { expect } from "./jestLLM";

const TEST_CASES = [
  {
    value: "",
    command:
      "Create a function called main that console.logs a very funny joke.",
    gazedCode: "",
    clipboard: "http://localhost:3000/",

    updated: `function main() {
    console.log("Why don't scientists trust atoms? Because they make up everything!");
}`,
    summary: "Added a function called main that console.logs a funny joke",
  },
];

const FUNCTIONS_TO_TEST = [
  {
    name: "writeCodeTwoStep",
    function: writeCodeTwoStep,
  },
  {
    name: "writeCodeOAFunctions",
    function: writeCodeOAFunctions,
  },
];

FUNCTIONS_TO_TEST.forEach(({ name: functionName, function: writeCode }) => {
  describe(functionName, () => {
    TEST_CASES.forEach((testCase) => {
      test(`${testCase.command}`, async () => {
        const result = await writeCode(
          testCase.value,
          testCase.command,
          testCase.gazedCode,
          testCase.clipboard
        );

        await expect(result.summary).toBeAsGoodAs(testCase.summary);
        await expect(result.updated).toBeAsGoodAs(testCase.updated);

        // TODO: compare timing of different functions/implementations
      }, 45000);
    });
  });
});
