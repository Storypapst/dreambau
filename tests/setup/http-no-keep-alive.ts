import http from "node:http";
import https from "node:https";

/**
 * Supertest binds a fresh ephemeral server for every request and closes it as
 * soon as the response ends. Node keeps client sockets pooled since v19, so a
 * pooled socket outlives the server it was opened against; when the operating
 * system later recycles that port for another test's server, the agent hands
 * the dead socket to a new request and the client reads bytes that never begin
 * with "HTTP/". The request then fails with
 * `Parse Error: Expected HTTP/, RTSP/ or ICE/` in whichever test happened to
 * draw that socket — a failure that has nothing to do with what that test
 * asserts, and that only shows up once a run opens enough ports for a
 * collision.
 *
 * Pooling buys a test process nothing, so it is turned off rather than worked
 * around in individual suites.
 */
http.globalAgent = new http.Agent({ keepAlive: false });
https.globalAgent = new https.Agent({ keepAlive: false });
