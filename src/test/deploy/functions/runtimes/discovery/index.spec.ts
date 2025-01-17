import { expect } from "chai";
import * as yaml from "js-yaml";
import * as sinon from "sinon";
import * as nock from "nock";

import * as api from "../../../../../api";
import { FirebaseError } from "../../../../../error";
import * as discovery from "../../../../../deploy/functions/runtimes/discovery";
import * as backend from "../../../../../deploy/functions/backend";

const MIN_FUNCTION = {
  platform: "gcfv1" as backend.FunctionsPlatform,
  id: "function",
  entryPoint: "entrypoint",
  trigger: {
    allowInsecure: false,
  },
};

const FUNCTION: backend.FunctionSpec = {
  ...MIN_FUNCTION,
  project: "project",
  region: api.functionsDefaultRegion,
  runtime: "nodejs14",
};

const YAML_OBJ = {
  specVersion: "v1alpha1",
  ...backend.empty(),
  cloudFunctions: [MIN_FUNCTION],
};

const YAML_TEXT = yaml.dump(YAML_OBJ);

const BACKEND: backend.Backend = {
  ...backend.empty(),
  cloudFunctions: [FUNCTION],
};

describe("yamlToBackend", () => {
  it("Accepts a valid v1alpha1 spec", () => {
    const parsed = discovery.yamlToBackend(
      YAML_OBJ,
      "project",
      api.functionsDefaultRegion,
      "nodejs14"
    );
    expect(parsed).to.deep.equal(BACKEND);
  });

  it("Requires a spec version", () => {
    const flawed: any = { ...YAML_OBJ };
    delete flawed.specVersion;
    expect(() =>
      discovery.yamlToBackend(flawed, "project", api.functionsDefaultRegion, "nodejs14")
    ).to.throw(FirebaseError);
  });

  it("Throws on unknown spec versions", () => {
    const flawed = {
      ...YAML_OBJ,
      specVersion: "32767beta2",
    };
    expect(() =>
      discovery.yamlToBackend(flawed, "project", api.functionsDefaultRegion, "nodejs14")
    ).to.throw(FirebaseError);
  });
});

describe("detectFromYaml", () => {
  let readFileAsync: sinon.SinonStub;

  beforeEach(() => {
    readFileAsync = sinon.stub(discovery, "readFileAsync");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("succeeds when YAML can be found", async () => {
    readFileAsync.resolves(YAML_TEXT);

    await expect(
      discovery.detectFromYaml("directory", "project", "nodejs14")
    ).to.eventually.deep.equal(BACKEND);
  });

  it("returns undefined when YAML cannot be found", async () => {
    readFileAsync.rejects({ code: "ENOENT" });

    await expect(discovery.detectFromYaml("directory", "project", "nodejs14")).to.eventually.equal(
      undefined
    );
  });
});

describe("detectFromPort", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // This test requires us to launch node and load express.js. On my 16" MBP this takes
  // 600ms, which is dangerously close to the default limit of 1s. Increase limits so
  // that this doesn't flake even when running on slower machines experiencing hiccup
  it("passes as smoke test", async () => {
    nock("http://localhost:8080").get("/backend.yaml").times(20).replyWithError({
      message: "Still booting",
      code: "ECONNREFUSED",
    });

    nock("http://localhost:8080").get("/backend.yaml").reply(200, YAML_TEXT);

    const parsed = await discovery.detectFromPort(8080, "project", "nodejs14");
    expect(parsed).to.deep.equal(BACKEND);
  });
});
