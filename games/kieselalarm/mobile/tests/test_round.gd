extends SceneTree

const Round = preload("res://scripts/round.gd")
var failed := false

func check(condition: bool, message: String) -> void:
	if not condition:
		printerr(message)
		failed = true

func _init() -> void:
	var target := {"id":"de-rad","text":"Rad","speech":"Rad","hint":"Räder","tier":1,"pattern":"Verlängern","traps":{"2":"t"}}
	var second := {"id":"de-hund","text":"Hund","hint":"Hunde","tier":1,"pattern":"Verlängern","traps":{}}
	var round = Round.new()
	round.start([target, second], {})
	check(round.status == "playing", "round starts")
	var first_id: String = round.word.id
	var expected: String = round.word.text[0]
	var false_choices = round.choices.filter(func(c): return c != expected)
	check(round.choices.size() == 3 and false_choices.size() == 2, "exactly one correct choice")
	round.choose(false_choices[0])
	check(round.cursor == 0 and round.log.size() == 1, "mistake recorded without advancing")
	check(round.score == -10 and round.seconds == 83.0, "wrong answer from zero costs 10 points and 2 seconds")
	check(round.status == "feedback", "feedback needs acknowledgement")
	round.advance(4.0)
	check(round.seconds == 83.0, "feedback freezes clock")
	round.resume_after_hint()
	round.pause()
	round.advance(12)
	round.choose(expected)
	check(round.cursor == 0 and round.seconds == 83.0, "pause freezes input and time")
	round.resume()
	for c in round.word.text:
		round.choose(c)
	check(round.completed == 1 and round.log.size() == 1, "assisted word earns no clean attempt")
	round.next_word()
	check(round.word.id != first_id, "word rotation")
	for c in round.word.text:
		round.choose(c)
	check(round.completed == 2 and round.log.size() == 2, "clean word event")
	round.next_word()
	check(round.mode == "kart", "mount kart after two words")
	round.advance(1000)
	check(round.status == "finished", "timeout ends round")
	var review = Round.new()
	review.start([target, second], round.log, true)
	check(review.word.id == first_id, "review selects missed word")
	review.submit_review(review.word.text)
	check(review.log.values().filter(func(e): return e.correct and e.get("review",false)).size() == 1, "review is tagged")
	review.next_word()
	check(review.status == "finished", "review stops after unique words")
	review.finalize_review()
	review.finalize_review()
	check(Round.unspent(review.log).values() == [5], "award once per review")
	round.start([target,second], review.log)
	check(round.seconds == 90 and Round.unspent(round.log).is_empty(), "time credited once")
	round.seconds = 1
	var wrong: String = round.choices.filter(func(c): return c != round.word.text[0])[0]
	round.choose(wrong)
	check(round.seconds == 0 and round.status == "feedback", "show final mistake and clamp timer")
	round.resume_after_hint()
	check(round.status == "finished", "end expired round after feedback")
	quit(1 if failed else 0)
