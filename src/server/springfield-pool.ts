import { environmentForOrisoEmail } from "./oriso-provisioning.js";

const springfieldNames = new Set([
  "abe.simpson", "bart.simpson", "blinky.fish", "clancy.bouvier", "cyrus.simpson", "herb.powell", "homer.simpson", "hugo.simpson",
  "jacqueline.bouvier", "krusty.clown", "laddie.dog", "ling.bouvier", "lisa.simpson", "maggie.simpson", "marge.simpson",
  "mojo.helper.monkey", "mona.simpson", "monty.burns", "mr.teeny", "ned.flanders", "patty.bouvier", "pinchy.lobster",
  "princess.pony", "ralph.wiggum", "santas.little.helper", "selma.bouvier", "sideshow.bob", "snowball.two", "spider.pig", "stampy.elephant"
]);

/** Existing operator pool membership; membership is never a disposal or ownership proof. */
export function isSpringfieldPoolEmail(email: string): boolean {
  return springfieldNames.has(email.split("@")[0]) && environmentForOrisoEmail(email) !== null;
}
