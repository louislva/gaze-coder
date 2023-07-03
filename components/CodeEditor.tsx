import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import hljs from "highlight.js";
import { CreateChatCompletionRequest } from "openai";

const CodeBlock = (props: {
  value: string;
  gazeY: number;
  onGaze: (whereIsGaze: "above" | "below" | "on") => void;
  highlightLevel: 0 | 1 | 2;
}) => {
  const { value, gazeY, onGaze, highlightLevel } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const startY = ref.current.getBoundingClientRect().top;
      const endY = ref.current.getBoundingClientRect().bottom;

      onGaze(gazeY < startY ? "above" : gazeY > endY ? "below" : "on");
    }
  }, [gazeY]);

  return (
    <div
      className={
        "font-mono pb-6 " +
        (highlightLevel === 2
          ? "bg-green-500/20"
          : highlightLevel === 1
          ? "bg-green-500/10"
          : "bg-transparent")
      }
      ref={ref}
    >
      <code>
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

const transcribe = async (
  blob: Blob,
  openAIKeyRef: MutableRefObject<string | null>
) => {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");
  formData.append("model", "whisper-1");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIKeyRef.current}`,
      },
      body: formData,
    }
  );
  if (response.status !== 200)
    throw new Error(`error from whisper: ${response.statusText}`);
  const data = await response.json();
  return data;
};
const code = async (
  codeChunks: string[],
  highlightIndex: number | null,
  command: string
): Promise<string> => {
  const documentCode = codeChunks.join("\n\n");
  const response = await fetch("/api/aiCodeChange", {
    method: "POST",
    body: JSON.stringify({
      value: documentCode,
      command,
      gazedCode:
        highlightIndex !== null &&
        highlightIndex >= 0 &&
        highlightIndex < codeChunks.length
          ? codeChunks[highlightIndex]
          : null,
    }),
  });
  if (response.status === 200) {
    const json = await response.json();
    const { updatedCode } = json;
    return updatedCode;
  } else {
    return documentCode;
  }
};

const CodeEditor = (props: {
  openAIKeyRef: React.MutableRefObject<string | null>;
  gazeY: number;
  onChange: (value: string) => void;
}) => {
  const { openAIKeyRef, gazeY, onChange } = props;
  const [value, setValue] = useState<string>(``);

  const [recording, setRecording] = useState<boolean>(false);
  const [_highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const highlightIndex = useFreezeIf(_highlightIndex, recording);
  const highlightIndexRef = useRef<number | null>(null);
  highlightIndexRef.current = highlightIndex;

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
            mediaRecorderRef.current.addEventListener("stop", async () => {
              console.log("recorder stopped");
              const blob = new Blob(recorderChunksRef.current, {
                type: "audio/ogg; codecs=opus",
              });
              // const audioURL = window.URL.createObjectURL(blob);

              recorderChunksRef.current = [];

              // Send to OpenAI Whisper for transcription
              const highlightIndexAtTimeOfRecording = highlightIndexRef.current;
              const transcription = await transcribe(blob, openAIKeyRef);

              // Send to GPT-3.5 for coding
              const result = await code(
                paragraphs,
                highlightIndexAtTimeOfRecording,
                transcription.text
              );
              console.log({ result });

              setValue(result);
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
                if (index === 0 && whereIsGaze === "above") {
                  setHighlightIndex(-1);
                }
                if (
                  index === paragraphs.length - 1 &&
                  whereIsGaze === "below"
                ) {
                  setHighlightIndex(paragraphs.length);
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
