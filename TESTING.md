# Pilot Night Checklist

A run-through script for testing with real people (and for the actual pilot
stream). Work top to bottom; everything should pass before going live with a
streamer's community.

## Before people arrive

- [ ] Open `https://trivia-blush-seven.vercel.app/host`, create the session,
      keep this tab open on a plugged-in computer — it drives the game.
- [ ] Add the Overlay Link as an OBS Browser Source (1920x1080). Confirm the
      panel floats transparently over your scene and shows the join
      call-to-action.
- [ ] Post the Player Link in chat/Discord.

## With 3+ real people on their own phones/networks

- [ ] Everyone joins; waiting-room count matches the number of people.
- [ ] Start the game. Question appears on phones and overlay within ~1s of
      each other; countdowns agree.
- [ ] Answers lock instantly and can't be changed.
- [ ] At reveal: correct answer, percentage bars, and still-in/eliminated
      banners all match what people actually did.
- [ ] Someone answers wrong on purpose → eliminated → sees spectator mode and
      keeps receiving questions.
- [ ] Someone doesn't answer at all → also eliminated.
- [ ] Someone locks their phone for a whole question, then unlocks → page
      catches up to the current state within ~15 seconds.
- [ ] Someone refreshes mid-question → still the same player, answer intact.
- [ ] Host closes their laptop lid for one question → the reveal still
      happens (players trigger the backup) and the game continues when the
      host reopens.
- [ ] Play to the end: survivor list on the host screen matches reality;
      winners see the survived screen; overlay shows the winner names.

## Known rough edges (fine for the pilot)

- Anyone with the host link's session open in the creating browser is the
  host; there's no login. Don't share your `/host/...` URL.
- A very wrong phone clock (minutes off) shows a wrong countdown; the
  database still judges answers fairly.
- Nicknames aren't unique — two "Alex"es are allowed.
