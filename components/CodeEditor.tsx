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
const useFreezeIf = (value: any, condition: boolean) => {
  const ref = useRef(value);
  if (!condition) {
    ref.current = value;
  }

  return ref.current;
};
const CodeEditor = (props: {
  gazeY: number;
  value: string;
  onChange: (value: string) => void;
}) => {
  const { gazeY, value, onChange } = props;

  const [recording, setRecording] = useState<boolean>(false);
  const [_highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const highlightIndex = useFreezeIf(_highlightIndex, recording);

  const paragraphs = value.split("\n\n");

  useEffect(() => {
    setInterval(() => {
      hljs.highlightAll();
    }, 500);

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => {
        if (e.key === " ") {
          setRecording(true);
        }
      });
      window.addEventListener("keyup", (e) => {
        if (e.key === " ") {
          setRecording(false);
        }
      });
    }
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Array<Blob>>([]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        console.log("getUserMedia supported.");
        navigator.mediaDevices
          .getUserMedia(
            // constraints - only audio needed for this app
            {
              audio: true,
            }
          )

          // Success callback
          .then((stream) => {
            mediaRecorderRef.current = new MediaRecorder(stream);
            mediaRecorderRef.current.addEventListener("dataavailable", (e) => {
              if (e.data.size > 0) {
                recorderChunksRef.current.push(e.data);
              }
            });
            mediaRecorderRef.current.addEventListener("stop", () => {
              console.log("recorder stopped");

              const clipName = prompt("Enter a name for your sound clip");

              const clipContainer = document.createElement("article");
              const clipLabel = document.createElement("p");
              const audio = document.createElement("audio");

              clipContainer.classList.add("clip");
              audio.setAttribute("controls", "");
              clipLabel.innerHTML = clipName;

              clipContainer.appendChild(audio);
              clipContainer.appendChild(clipLabel);
              window.document.body.appendChild(clipContainer);

              const blob = new Blob(recorderChunksRef.current, {
                type: "audio/ogg; codecs=opus",
              });
              const audioURL = window.URL.createObjectURL(blob);
              audio.src = audioURL;

              recorderChunksRef.current = [];
            });
          })

          // Error callback
          .catch((err) => {
            console.error(`The following getUserMedia error occurred: ${err}`);
          });
      } else {
        console.log("getUserMedia not supported on your browser!");
      }
    }
  }, []);

  useEffect(() => {
    if (mediaRecorderRef.current) {
      if (recording) {
        recorderChunksRef.current = [];
        mediaRecorderRef.current.start();
      } else {
        mediaRecorderRef.current.stop();
      }
    }
  }, [recording]);

  return (
    <>
      {paragraphs.map((paragraph, index) => {
        return (
          <CodeBlock
            value={paragraph}
            gazeY={gazeY}
            onGaze={(whereIsGaze) => {
              if (!recording) {
                if (whereIsGaze === "on") {
                  setHighlightIndex(index);
                }
                if (
                  index === paragraphs.length - 1 &&
                  whereIsGaze === "under"
                ) {
                  // if we're on the last paragraph and the gaze is still further down, no highlight
                  setHighlightIndex(index + 1);
                }
                if (index === 0 && whereIsGaze === "over") {
                  // if we're on the first paragraph and the gaze is still further up, no highlight
                  setHighlightIndex(-1);
                }
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
