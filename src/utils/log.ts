import { UniCore } from "unibot-api/UniCore";

export const print = (message: string) => {
  UniCore.Log(message);
};
