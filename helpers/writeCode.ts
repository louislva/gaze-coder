import writeCodeTwoStep from "@/helpers/writeCode/writeCodeTwoStep";
import writeCodeOAFunctions from "@/helpers/writeCode/writeCodeOAFunctions";

export type WriteCodeOutput = {
  updated: string;
  summary: string;
};

export { writeCodeTwoStep, writeCodeOAFunctions };
export default writeCodeTwoStep;
