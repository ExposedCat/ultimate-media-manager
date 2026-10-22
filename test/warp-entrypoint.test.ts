import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";

async function runWarp(options: {
	failures?: number;
	cached?: boolean;
	rotate?: boolean;
	generationFails?: boolean;
}) {
	const root = await Deno.makeTempDir({ prefix: "umm-warp-test-" });
	try {
		await Deno.mkdir(`${root}/bin`);
		await Deno.mkdir(`${root}/state`);
		await Deno.writeTextFile(`${root}/failures`, String(options.failures ?? 0));
		await Deno.writeTextFile(`${root}/events`, "");
		if (options.cached) {
			await Deno.writeTextFile(
				`${root}/state/wgcf-account.toml`,
				"old account",
			);
			await Deno.writeTextFile(
				`${root}/state/wgcf-profile.conf`,
				"old profile",
			);
		}
		const scripts = {
			wgcf: `#!/bin/sh
set -eu
echo "$1" >>"$UMM_WARP_TEST_DIR/events"
if [ "$1" = register ]; then
  remaining="$(cat "$UMM_WARP_TEST_DIR/failures")"
  if [ "$remaining" -gt 0 ]; then
    echo "$((remaining - 1))" >"$UMM_WARP_TEST_DIR/failures"
    exit 1
  fi
  echo "new account" >wgcf-account.toml
else
  [ "$UMM_WARP_TEST_GENERATION_FAILS" = 0 ] || exit 1
  echo "new profile" >wgcf-profile.conf
fi
`,
			wireproxy: `#!/bin/sh
echo "proxy $*" >>"$UMM_WARP_TEST_DIR/events"
`,
			sleep: `#!/bin/sh
echo "sleep $1" >>"$UMM_WARP_TEST_DIR/events"
if [ "$UMM_WARP_TEST_ROTATE" = 1 ]; then
  [ ! -e "$UMM_WARP_TEST_DIR/slept" ] || exit 1
  touch "$UMM_WARP_TEST_DIR/slept"
fi
`,
		};
		for (const [name, script] of Object.entries(scripts)) {
			await Deno.writeTextFile(`${root}/bin/${name}`, script, { mode: 0o755 });
		}
		const result = await new Deno.Command("sh", {
			args: ["warp/entrypoint.sh"],
			env: {
				PATH: `${root}/bin:${Deno.env.get("PATH")}`,
				WARP_STATE_DIR: `${root}/state`,
				WARP_ROTATE_MINUTES: options.rotate ? "1" : "0",
				UMM_WARP_TEST_DIR: root,
				UMM_WARP_TEST_ROTATE: options.rotate ? "1" : "0",
				UMM_WARP_TEST_GENERATION_FAILS: options.generationFails ? "1" : "0",
			},
		}).output();
		assertEquals(result.code, 0);
		return {
			events: (await Deno.readTextFile(`${root}/events`)).trim().split("\n"),
			profile: await Deno.readTextFile(`${root}/state/wgcf-profile.conf`),
			account: await Deno.readTextFile(`${root}/state/wgcf-account.toml`),
			stderr: new TextDecoder().decode(result.stderr),
		};
	} finally {
		await Deno.remove(root, { recursive: true });
	}
}

Deno.test("WARP registration backs off to 60 seconds before starting the proxy", async () => {
	const result = await runWarp({ failures: 5 });
	assertEquals(
		result.events.filter((event) => event.startsWith("sleep ")),
		["sleep 10", "sleep 20", "sleep 40", "sleep 60", "sleep 60"],
	);
	assertEquals(result.events.filter((event) => event === "register").length, 6);
	assertEquals(result.events.at(-1), "proxy --config wgcf-profile.conf");
	assertStringIncludes(result.profile, "BindAddress = 0.0.0.0:1080");
});

Deno.test("WARP reuses its persisted profile on startup", async () => {
	const result = await runWarp({ cached: true });
	assertEquals(result.events, ["proxy --config wgcf-profile.conf"]);
	assertEquals(result.profile, "old profile");
	assertEquals(result.account, "old account");
});

Deno.test("WARP replaces the profile and restarts the proxy after successful rotation", async () => {
	const result = await runWarp({ cached: true, rotate: true });
	assertEquals(
		result.events.filter((event) => event.startsWith("proxy ")).length,
		2,
	);
	assertEquals(result.account, "new account\n");
	assertStringIncludes(result.profile, "new profile");
	assertStringIncludes(result.profile, "BindAddress = 0.0.0.0:1080");
});

for (const failure of ["registration", "generation"]) {
	Deno.test(`WARP keeps its current proxy and profile on failed ${failure} during rotation`, async () => {
		const result = await runWarp({
			cached: true,
			rotate: true,
			failures: failure === "registration" ? 1 : 0,
			generationFails: failure === "generation",
		});
		assertEquals(
			result.events.filter((event) => event.startsWith("proxy ")).length,
			1,
		);
		assertEquals(result.profile, "old profile");
		assertEquals(result.account, "old account");
		assertStringIncludes(
			result.stderr,
			"Rotation failed; keeping the current proxy",
		);
	});
}
