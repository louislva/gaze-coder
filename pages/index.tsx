import CodeEditor from "@/components/CodeEditor";

const exampleDoc = `const input = "";

const output = input
  .split("\\n\\n")
  .map((x) => x.trim())
  .map((x) => x.split("\\n").reduce((acc, x) => acc + parseInt(x), 0))
  .sort((a, b) => b - a)
  .slice(0, 3)
  .reduce((acc, item) => acc + item);

console.log({ output });`;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-between p-24">
      <CodeEditor value={exampleDoc} onChange={(str) => {}} />
    </div>
  );
}
