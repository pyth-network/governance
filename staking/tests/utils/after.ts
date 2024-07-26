import { CustomAbortController } from "./before";

export async function abortUnlessDetached(
  portNumber: number,
  controller: CustomAbortController
) {
  if (process.env.DETACH) {
    console.log(
      `The validator is still running at url http://127.0.0.1:${portNumber}`
    );
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  await controller.abort();
}
