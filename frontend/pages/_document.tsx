import Document, { Html, Head, Main, NextScript } from 'next/document'

class CustomDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link
            href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@300;400;600&family=Red+Hat+Mono&family=Red+Hat+Text&display=swap"
            rel="stylesheet"
          />
          <link
            href="favicon.ico"
            rel="icon"
            media="(prefers-color-scheme: light)"
          />
          <link
            href="favicon-light.ico"
            rel="icon"
            media="(prefers-color-scheme: dark)"
          />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon-16x16.png"
          />
          <link rel="manifest" href="/site.webmanifest" />
          <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#242235" />
          <meta name="msapplication-TileColor" content="#242235" />
          <meta name="theme-color" content="#242235"></meta>
        </Head>
        <body className="min-h-screen">
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default CustomDocument
