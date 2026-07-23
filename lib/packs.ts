import samplePack from "@/packs/sample-pack.json";

// Three round types can be mixed freely in one pack:
//   { "text": "...", "options": [4 strings], "correct_option_index": 0-3 }
//     -> classic trivia; wrong or missing answers are eliminated
//   { "type": "majority", "text": "...", "options": [2-4 strings] }
//     -> no right answer, nobody eliminated; the crowd split is the fun
//   { "type": "closest", "text": "...", "answer": <number> }
//     -> players type a number; the closest half of survivors stays alive
export type PackQuestion = {
  type?: "trivia" | "majority" | "closest";
  text: string;
  options?: string[];
  correct_option_index?: number;
  answer?: number;
};

export type Pack = {
  pack_id: string;
  name: string;
  questions: PackQuestion[];
};

// Add new packs here: drop a JSON file in packs/ and import it above.
export const packs: Pack[] = [samplePack as Pack];
