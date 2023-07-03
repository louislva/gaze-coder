import CodeEditor from "@/components/CodeEditor";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

// Tell typescript that webgazer actually exists as a global variable
declare var webgazer: any;

export default function Home() {
  const [gazeMode, setGazeMode] = useState<"real" | "mouse">("mouse");
  const [gazeY, setGazeY] = useState(0);
  const gazeYRef = useRef(0);
  gazeYRef.current = gazeY;
  const lastGazeYUpdate = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (gazeMode === "real") {
        webgazer.clearData();
        webgazer.begin();
        webgazer.applyKalmanFilter(true);
        const gazeListener = (data: any, elapsedTime: number) => {
          // console.log({ data, elapsedTime });
          if (data) {
            const y = Math.min(Math.max(data.y, 0), window.innerHeight);

            if (
              Math.abs(gazeYRef.current - y) > 1 &&
              Date.now() - lastGazeYUpdate.current > 50
            ) {
              setGazeY(y);
              lastGazeYUpdate.current = Date.now();
            }
          }
        };
        webgazer.setGazeListener(gazeListener);
        return () => {
          webgazer.end();
          //   webgazer.removeGazeListener(gazeListener);
        };
      } else {
        const mouseListener = (event: MouseEvent) => {
          setGazeY(event.clientY);
        };
        window.addEventListener("mousemove", mouseListener);
        return () => {
          window.removeEventListener("mousemove", mouseListener);
        };
      }
    }
  }, [gazeMode]);

  const openAIKeyRef = useRef<null | string>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      let acceptedKey: null | string = null;
      if (localStorage.getItem("openaikey")) {
        acceptedKey = localStorage.getItem("openaikey");
      }
      while (!acceptedKey) {
        const key = prompt(
          "Please enter your OpenAI API key, to use GazeCoder:"
        ) as string;
        if (key.startsWith("sk-")) {
          acceptedKey = key;
        }
      }
      localStorage.setItem("openaikey", acceptedKey);
      openAIKeyRef.current = acceptedKey;
    }
  }, []);

  return (
    <>
      <Head>
        {/* required before everything else loads */}
        <script src="/webgazer.js" type="text/javascript" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </Head>
      <CodeEditor
        openAIKeyRef={openAIKeyRef}
        gazeY={gazeY}
        onChange={(str) => {}}
      />
    </>
  );
}
