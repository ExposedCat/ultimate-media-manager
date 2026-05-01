const HEALTH_HOST = "0.0.0.0";
const HEALTH_PORT = 3000;

export function startHealthServer() {
	return Deno.serve(
		{
			hostname: HEALTH_HOST,
			port: HEALTH_PORT,
		},
		() => new Response("ok", { status: 200 }),
	);
}

export async function stopHealthServer(server: Deno.HttpServer) {
	await server.shutdown();
}
