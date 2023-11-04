import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import hljs from "highlight.js";

const ACTION_HISTORY_BUFFER_SIZE = 10;
const HISTORY_BUFFER_SIZE = 20;
const MIN_RECORDING_DURATION = 500;

type LoadingStateType = "idle" | "recording" | "transcribing" | "thinking";

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
  summary?: string;
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
  gazeMode: "real" | "mouse";
  setGazeMode: (gazeMode: "real" | "mouse") => void;
  openAIKeyRef: React.MutableRefObject<string | null>;
  gazeY: number;
  onChange: (value: string) => void;
}) => {
  const { gazeMode, setGazeMode, openAIKeyRef, gazeY, onChange } = props;

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
            Math.max(0, gazeIndex),
            Math.min(gazeIndex + 1, codeChunks.length)
          )
          .join("\n\n")
      : null;
  const gazedCodeRef = useRef<string | null>(null);
  gazedCodeRef.current = gazedCode;

  // Past actions
  const [actionHistory, setActionHistory] = useState<ActionType[]>([]);

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
                setLoadingState("transcribing");
                const gazedCodeAtTimeOfRecording = gazedCodeRef.current;
                const transcription = await transcribe(blob, openAIKeyRef);

                // Send to GPT-3.5 for coding
                setLoadingState("thinking");
                const { type, payload, summary } = await code(
                  documentCodeRef.current,
                  gazedCodeAtTimeOfRecording,
                  transcription.text
                );
                setActionHistory((prevActionHistory) =>
                  prevActionHistory
                    .concat({ type, payload, summary })
                    .slice(-ACTION_HISTORY_BUFFER_SIZE)
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
                setLoadingState("idle");
              } else {
                setLoadingState("idle");
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

  const [loadingState, setLoadingState] = useState<LoadingStateType>("idle");
  useEffect(() => {
    if (mediaRecorderRef.current) {
      if (recording) {
        setLoadingState("recording");
        recorderChunksRef.current = [];
        mediaRecorderRef.current.start();
      } else {
        mediaRecorderRef.current.stop();
      }
    }
  }, [recording]);

  return (
    <div className="flex w-full h-screen flex-row bg-zinc-700">
      <div className="w-80 h-full flex flex-col overflow-hidden">
        <div className="h-60 bg-black w-full">
          <div
            className="absolute m-4 h-12 bg-zinc-800 p-1 flex flex-row gap-1"
            style={{
              zIndex: 1000,
              borderRadius: "0.5rem",
            }}
          >
            <button
              className={
                "text-lg text-zinc-300 h-full px-2 flex flex-row items-center gap-2 transition-all duration-200 " +
                (gazeMode === "real"
                  ? "bg-zinc-600"
                  : "bg-transparent hover:bg-zinc-700")
              }
              onClick={() => setGazeMode("real")}
              style={{
                borderRadius: "0.25rem",
              }}
            >
              <span className="material-symbols-outlined">face</span>
              Eyes
            </button>
            <button
              className={
                "text-lg text-zinc-300 h-full px-2 flex flex-row items-center gap-2 transition-all duration-200 " +
                (gazeMode === "mouse"
                  ? "bg-zinc-600"
                  : "bg-transparent hover:bg-zinc-700")
              }
              onClick={() => setGazeMode("mouse")}
              style={{
                borderRadius: "0.25rem",
              }}
            >
              <span className="material-symbols-outlined">mouse</span>
              Mouse
            </button>
          </div>
        </div>
        <div className="relative flex-1 py-4 pl-4 pr-0 overflow-hidden">
          {/* Current loading state indicator */}
          <div className="rounded-md bg-zinc-800 mb-4 flex flex-row items-center text-white p-4 mb-4">
            <span className="material-symbols-outlined mr-4 text-3xl">
              {
                {
                  idle: "mic",
                  recording: "record_voice_over",
                  transcribing: "sms",
                  thinking: "neurology",
                }[loadingState]
              }
            </span>
            <div className="flex-1 flex flex-col text-left items-start">
              <div className="text-md font-bold">
                {
                  {
                    idle: "Idle",
                    recording: "Recording...",
                    transcribing: "Transcribing...",
                    thinking: "Thinking...",
                  }[loadingState]
                }
              </div>
              <div>
                {
                  {
                    idle: "(Hold Space to speak)",
                    recording: "(Release Space when you finish speaking)",
                    transcribing: "",
                    thinking: "",
                  }[loadingState]
                }
              </div>
            </div>
          </div>
          {/* Action history */}
          {!!actionHistory.length && (
            <div className="rounded-md bg-zinc-800 mb-4 flex flex-col items-start text-white p-4 py-1 mb-4">
              {actionHistory
                .slice()
                .reverse()
                .map((action, index) => {
                  return (
                    <div
                      className={
                        "flex flex-row items-center py-3 w-full " +
                        (!!index ? "border-t border-zinc-700" : "")
                      }
                    >
                      <span className="material-symbols-outlined mr-4 text-3xl">
                        {
                          {
                            undo: "undo",
                            updateCode: "code",
                            none: "pending",
                          }[action.type]
                        }
                      </span>
                      <div className="flex-1 flex flex-col text-left items-start">
                        <div className="text-md font-bold">
                          {
                            {
                              undo:
                                'Undo "' +
                                actionHistory
                                  .slice()
                                  .reverse()
                                  .slice(index)
                                  .find(
                                    (action) => action.type === "updateCode"
                                  )?.summary +
                                '"',
                              updateCode: action.summary || "Code updated",
                              none: "Attempt failed",
                            }[action.type]
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          {/* Fade out */}
          <div className="absolute w-full bottom-0 h-8 from-zinc-700 via-zinc-700 to-transparent bg-gradient-to-t z-10"></div>
        </div>
      </div>
      <div className="flex-1 p-4 flex flex-col overflow-auto">
        <div className="p-2 rounded-md bg-zinc-800 text-white flex-1">
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
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;
