export function stripFullStopEnding(text: string): string {
  return text.trim().replace(/[.,]$/, "");
}
export default function stripTranscription(transcription: string): string {
  return stripFullStopEnding(transcription.trim().replace(/\n/g, " "));
}
