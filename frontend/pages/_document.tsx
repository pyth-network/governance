import Document, { Html, Head, Main, NextScript } from 'next/document'

class CustomDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link
            href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&family=Urbanist:wght@400;600;700&display=swap"
            rel="stylesheet"
          />
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
