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

import { endGroup, getInput, setFailed, startGroup } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { existsSync } from "fs";
import { createCheck } from "./createCheck";
import { createGacFile } from "./createGACFile";
import { deployCloudFunctions, ErrorResult } from "./deploy";

// Inputs defined in action.yml
const projectId = getInput("projectId");
const googleApplicationCredentials = getInput("serviceAccountKey", {
  required: true,
});
const functionNames = getInput("functionNames");
const token = process.env.GITHUB_TOKEN || getInput("repoToken");
const octokit = token ? getOctokit(token) : undefined;
const entryPoint = getInput("entryPoint");
const firebaseToolsVersion = getInput("firebaseToolsVersion");

async function run() {
  const isPullRequest = !!context.payload.pull_request;

  let finish = (details: Object) => console.log(details);
  if (token && isPullRequest) {
    finish = await createCheck(octokit, context);
  }

  try {
    startGroup("Verifying firebase.json exists");

    if (entryPoint !== ".") {
      console.log(`Changing to directory: ${entryPoint}`);
      try {
        process.chdir(entryPoint);
      } catch (err) {
        throw Error(`Error changing to directory ${entryPoint}: ${err}`);
      }
    }

    if (existsSync("./firebase.json")) {
      console.log("firebase.json file found. Continuing deploy.");
    } else {
      throw Error(
        "firebase.json file not found. If your firebase.json file is not in the root of your repo, edit the entryPoint option of this GitHub action."
      );
    }
    endGroup();

    startGroup("Setting up temporary CLI credentials");
    const gacFilename = await createGacFile(googleApplicationCredentials);
    console.log(
      "Created a temporary file with Application Default Credentials with the provided service account."
    );
    endGroup();

    startGroup("Deploying cloud functions");
    const deployment = await deployCloudFunctions(
      gacFilename,
      {
        projectId,
        firebaseToolsVersion,
      },
      functionNames
    );
    if (deployment.status === "error") {
      throw Error((deployment as ErrorResult).error);
    } else if (deployment.status === "success") {
      console.log("Cloud functions deployed successfully.");
    }
    endGroup();
  } catch (e) {
    setFailed(e.message);

    await finish({
      conclusion: "failure",
      output: {
        title: "Deploy preview failed",
        summary: `Error: ${e.message}`,
      },
    });
  }
}

run();
