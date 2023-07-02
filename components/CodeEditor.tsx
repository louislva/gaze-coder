import React, { useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

const CodeBlock = (props: {
  value: string;
  gazeY: number;
  onGaze: (whereIsGaze: "over" | "under" | "on") => void;
  highlightLevel: 0 | 1 | 2;
}) => {
  const { value, gazeY, onGaze, highlightLevel } = props;
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) {
      const startY = ref.current.getBoundingClientRect().top;
      const endY = ref.current.getBoundingClientRect().bottom;

      console.log(startY, endY, "res:", gazeY > startY && gazeY < endY);

      onGaze(gazeY < startY ? "over" : gazeY > endY ? "under" : "on");
    }
  }, [gazeY]);

  return (
    <div
      className={
        "font-mono " +
        (highlightLevel === 2
          ? "bg-green-500/20"
          : highlightLevel === 1
          ? "bg-green-500/10"
          : "bg-transparent")
      }
    >
      <code ref={ref}>
        <pre>{value}</pre>
      </code>
    </div>
  );
};
const CodeEditor = (props: {
  gazeY: number;
  value: string;
  onChange: (value: string) => void;
}) => {
  const { gazeY, value, onChange } = props;

  useEffect(() => {
    setInterval(() => {
      hljs.highlightAll();
    }, 500);
  }, []);

  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const paragraphs = value.split("\n\n");
  return (
    <>
      {paragraphs.map((paragraph, index) => {
        return (
          <CodeBlock
            value={paragraph}
            gazeY={gazeY}
            onGaze={(whereIsGaze) => {
              if (whereIsGaze === "on") {
                setHighlightIndex(index);
              }
              if (index === paragraphs.length - 1 && whereIsGaze === "under") {
                // if we're on the last paragraph and the gaze is still further down, no highlight
                setHighlightIndex(index + 1);
              }
              if (index === 0 && whereIsGaze === "over") {
                // if we're on the first paragraph and the gaze is still further up, no highlight
                setHighlightIndex(-1);
              }
            }}
            highlightLevel={
              highlightIndex === index
                ? 2
                : Math.abs((highlightIndex || -1000) - index) === 1
                ? 1
                : 0
            }
          />
        );
      })}
    </>
  );
};

export default CodeEditor;
