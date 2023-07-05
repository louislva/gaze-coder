import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        {/* Favicon */}
        <link
          rel="icon"
          type="image/png"
          sizes="160x160"
          href="/eyes.png"
        ></link>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
