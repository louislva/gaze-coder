import React, { useEffect, useRef } from "react";
import hljs from "highlight.js";

const CodeEditor = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  useEffect(() => {
    setInterval(() => {
      hljs.highlightAll();
    }, 500);
  }, []);

  return (
    <>
      {value.split("\n\n").map((paragraph) => {
        return (
          <code className="">
            <pre>{paragraph}</pre>
          </code>
        );
      })}
    </>
  );
};

export default CodeEditor;
