import Document, { Html, Head, Main, NextScript } from 'next/document'

class CustomDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link rel="preconnect" href="https://fonts.gstatic.com" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=PT+Mono&display=swap"
            rel="stylesheet"
          />
          <link rel="stylesheet" href="https://use.typekit.net/wsv5ulf.css" />
        </Head>
        <body className="min-h-screen bg-darkerPurpleBackground">
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default CustomDocument
