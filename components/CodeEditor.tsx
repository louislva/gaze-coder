import React, { MutableRefObject, useEffect, useRef, useState } from "react";
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

      onGaze(gazeY < startY ? "over" : gazeY > endY ? "under" : "on");
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
  highlightIndex: number,
  command: string
): Promise<string> => {
  const systemPrompt =
    "You are an AI coding assistant. The user shows you their code, makes a request, and you output the complete document with the added change. Nothing else.";

  const highlightedCodePrompt =
    highlightIndex >= 0 && highlightIndex < codeChunks.length
      ? " When the user was saying that command, they were looking at the following part of the code:\n\n```\n" +
        codeChunks[highlightIndex] +
        "\n```\n\nBut I don't fully know if that was the part of the code they were talking about."
      : "";
  const fullUserPrompt =
    "Here's the current code:\n\n```\n" +
    codeChunks.join("\n\n") +
    "\n```\n\nAnd here's your command:\n\n\"" +
    command +
    '".' +
    highlightedCodePrompt +
    " Please do the command / make the change now.";

  console.log("systemPrompt", systemPrompt);
  console.log("fullUserPrompt", fullUserPrompt);

  const response = await fetch("/api/openai", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-3.5-turbo-16k-0613",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: fullUserPrompt,
        },
      ],
    }),
  });
  const json = await response.json();
  return json[0].message.content;
};

const CodeEditor = (props: {
  openAIKeyRef: React.MutableRefObject<string | null>;
  gazeY: number;
  onChange: (value: string) => void;
}) => {
  const { openAIKeyRef, gazeY, onChange } = props;
  const [value, setValue] = useState<string>(`const input = "";

const output = input
  .split("\\n\\n")
  .map((x) => x.trim())
  .map((x) => x.split("\\n").reduce((acc, x) => acc + parseInt(x), 0))
  .sort((a, b) => b - a)
  .slice(0, 3)
  .reduce((acc, item) => acc + item);

console.log({ output });`);

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
            mediaRecorderRef.current.addEventListener("stop", async () => {
              console.log("recorder stopped");
              const blob = new Blob(recorderChunksRef.current, {
                type: "audio/ogg; codecs=opus",
              });
              // const audioURL = window.URL.createObjectURL(blob);

              recorderChunksRef.current = [];

              // Send to OpenAI Whisper for transcription
              const transcription = await transcribe(blob, openAIKeyRef);

              // Send to GPT-3.5 for coding
              setValue(
                await code(paragraphs, highlightIndex, transcription.text)
              );
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
