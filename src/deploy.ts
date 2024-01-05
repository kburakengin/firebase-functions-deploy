/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { exec } from "@actions/exec";

export type ErrorResult = {
  status: "error";
  error: string;
};

export type DeploySuccessResult = {
  status: "success";
  result: {
    functions: string | string[];
  };
};

type DeployConfig = {
  projectId: string;
  firebaseToolsVersion?: string;
};

async function execWithCredentials(
  args: string[],
  projectId: string,
  gacFilename: string,
  opts: { debug?: boolean; firebaseToolsVersion?: string }
) {
  let deployOutputBuf: Buffer[] = [];
  const debug = opts.debug || false;
  const firebaseToolsVersion = opts.firebaseToolsVersion || "latest";

  try {
    await exec(
      `npx firebase-tools@${firebaseToolsVersion}`,
      [
        ...args,
        ...(projectId ? ["--project", projectId] : []),
        debug
          ? "--debug" // gives a more thorough error message
          : "--json", // allows us to easily parse the output
      ],
      {
        listeners: {
          stdout(data: Buffer) {
            deployOutputBuf.push(data);
          },
        },
        env: {
          ...process.env,
          GOOGLE_APPLICATION_CREDENTIALS: gacFilename, // the CLI will automatically authenticate with this env variable set
        },
      }
    );
  } catch (e) {
    console.log(Buffer.concat(deployOutputBuf).toString("utf-8"));
    console.log(e.message);

    if (!debug) {
      console.log(
        "Retrying deploy with the --debug flag for better error output"
      );
      await execWithCredentials(args, projectId, gacFilename, {
        debug: true,
        firebaseToolsVersion,
      });
    } else {
      throw e;
    }
  }

  return deployOutputBuf.length
    ? deployOutputBuf[deployOutputBuf.length - 1].toString("utf-8")
    : ""; // output from the CLI
}

export async function deployCloudFunctions(
  gacFilename: string,
  productionDeployConfig: DeployConfig,
  functionNames?: string
) {
  const { projectId, firebaseToolsVersion } = productionDeployConfig;

  let functionArgs: string = "functions";

  if (functionNames) {
    const functionNamesList = functionNames.split(",");
    // add functions to each functionNames beginnig like "functions:" and , like functions:myFunction,functions:myFunction2
    const functionArgsList = functionNamesList.map(
      (name) => `functions:${name}`
    );
    functionArgs = functionArgsList.join(",");
  }

  const deploymentText = await execWithCredentials(
    ["deploy", "--only", functionArgs],
    projectId,
    gacFilename,
    { firebaseToolsVersion }
  );

  const deploymentResult = JSON.parse(deploymentText) as
    | DeploySuccessResult
    | ErrorResult;

  return deploymentResult;
}
