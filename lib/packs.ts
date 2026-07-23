import samplePack from "@/packs/sample-pack.json";

export type Pack = {
  pack_id: string;
  name: string;
  questions: {
    text: string;
    options: string[];
    correct_option_index: number;
  }[];
};

// Add new packs here: drop a JSON file in packs/ and import it above.
export const packs: Pack[] = [samplePack as Pack];
