import CodeEditor from "@/components/CodeEditor";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

const exampleDoc = `const input = "";

const output = input
  .split("\\n\\n")
  .map((x) => x.trim())
  .map((x) => x.split("\\n").reduce((acc, x) => acc + parseInt(x), 0))
  .sort((a, b) => b - a)
  .slice(0, 3)
  .reduce((acc, item) => acc + item);

console.log({ output });`;

// Tell typescript that webgazer actually exists as a global variable
declare var webgazer: any;

export default function Home() {
  const [gazeY, setGazeY] = useState(0);
  const gazeYRef = useRef(0);
  gazeYRef.current = gazeY;
  const lastGazeYUpdate = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      webgazer.begin();
      webgazer.applyKalmanFilter(true);
      webgazer.setGazeListener((data: any, elapsedTime: number) => {
        // console.log({ data, elapsedTime });
        if (data) {
          const y = Math.min(Math.max(data.y, 0), window.innerHeight);

          if (
            Math.abs(gazeYRef.current - y) > 8 &&
            Date.now() - lastGazeYUpdate.current > 100
          ) {
            setGazeY(y);
            lastGazeYUpdate.current = Date.now();
          }
        }
      });
    }
  }, []);

  return (
    <>
      <Head>
        {/* required before everything else loads */}
        <script src="/webgazer.js" type="text/javascript" />
      </Head>

      <div className="flex w-full min-h-screen flex-row bg-zinc-700">
        <div className="w-80 flex flex-col">
          <div className="h-60 bg-black w-full"></div>
        </div>
        <div className="flex-1 p-4 flex flex-col">
          <div className="p-2 rounded-md bg-zinc-800 text-white flex-1">
            {/* <Callibration /> */}
            <CodeEditor
              gazeY={gazeY}
              value={exampleDoc}
              onChange={(str) => {}}
            />
          </div>
        </div>
      </div>
    </>
  );
}
