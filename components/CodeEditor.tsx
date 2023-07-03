import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

const HISTORY_BUFFER_SIZE = 20;
const MIN_RECORDING_DURATION = 500;

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

export type ActionType = {
  type: "updateCode" | "undo" | "none";
  payload?: any;
};

const code = async (
  documentCode: string,
  highlightedCode: string | null,
  command: string
): Promise<ActionType> => {
  const clipboard = await window.navigator.clipboard.readText();
  const response = await fetch("/api/aiCodeChange", {
    method: "POST",
    body: JSON.stringify({
      value: documentCode,
      command,
      gazedCode: highlightedCode,
      clipboard,
    }),
  });
  if (response.status === 200) {
    return await response.json();
  } else {
    return {
      type: "none",
    };
  }
};

const CodeEditor = (props: {
  openAIKeyRef: React.MutableRefObject<string | null>;
  gazeY: number;
  onChange: (value: string) => void;
}) => {
  const { openAIKeyRef, gazeY, onChange } = props;

  // State of code
  const [documentCodeHistory, setDocumentCodeHistory] = useState<string[]>([
    "",
  ]);
  const documentCode = documentCodeHistory[documentCodeHistory.length - 1];
  const documentCodeRef = useRef<string>(documentCode);
  documentCodeRef.current = documentCode;
  const codeChunks = documentCode.split("\n\n");

  // State of editing
  const [recording, setRecording] = useState<boolean>(false);
  const recordingStartedRef = useRef<number>(0);
  const recordingDurationRef = useRef<number>(0);
  useEffect(() => {
    if (recording) recordingStartedRef.current = Date.now();
    else
      recordingDurationRef.current = Date.now() - recordingStartedRef.current;
  }, [recording]);

  // State of highlighting / gaze
  const [_gazeIndex, setGazeIndex] = useState<number | null>(null);
  const gazeIndex = useFreezeIf(_gazeIndex, recording);
  const gazeIndexRef = useRef<number | null>(null);
  gazeIndexRef.current = gazeIndex;
  const gazedCode =
    gazeIndex !== null && gazeIndex >= -1 && gazeIndex < codeChunks.length
      ? codeChunks
          .slice(
            Math.max(0, gazeIndex - 1),
            Math.min(gazeIndex + 1, codeChunks.length - 1)
          )
          .join("\n\n")
      : null;
  const gazedCodeRef = useRef<string | null>(null);
  gazedCodeRef.current = gazedCode;

  useEffect(() => {
    // Syntax highlighting (broken)
    setInterval(() => {
      hljs.highlightAll();
    }, 500);

    // Space-bar voice commands
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

              if (recordingDurationRef.current > MIN_RECORDING_DURATION) {
                // Send to OpenAI Whisper for transcription
                const gazedCodeAtTimeOfRecording = gazedCodeRef.current;
                const transcription = await transcribe(blob, openAIKeyRef);

                // Send to GPT-3.5 for coding
                const { type, payload } = await code(
                  documentCodeRef.current,
                  gazedCodeAtTimeOfRecording,
                  transcription.text
                );
                switch (type) {
                  case "updateCode":
                    setDocumentCodeHistory((prevVersionHistory) =>
                      prevVersionHistory
                        .concat([payload])
                        .slice(-HISTORY_BUFFER_SIZE)
                    );
                    break;
                  case "undo":
                    setDocumentCodeHistory((prevVersionHistory) =>
                      prevVersionHistory.slice(0, -1)
                    );
                  default:
                    break;
                }
              }
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
      {codeChunks.map((codeChunk, index) => {
        return (
          <CodeBlock
            key={index}
            value={codeChunk}
            gazeY={gazeY}
            onGaze={(whereIsGaze) => {
              if (!recording) {
                if (whereIsGaze === "on") {
                  setGazeIndex(index);
                }
                if (index === 0 && whereIsGaze === "above") {
                  setGazeIndex(-1);
                }
                if (
                  index === codeChunks.length - 1 &&
                  whereIsGaze === "below"
                ) {
                  setGazeIndex(codeChunks.length);
                }
              }
            }}
            highlightLevel={
              gazeIndex === index
                ? 2
                : Math.abs((gazeIndex || -1000) - index) === 1
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
