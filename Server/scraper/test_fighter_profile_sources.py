import unittest

from fighter_profile_sources import (
    merge_profiles,
    name_score,
    parse_sherdog_profile,
    parse_ufc_profile,
    parse_wikipedia_profile,
)


class FighterProfileSourceTests(unittest.TestCase):
    def test_known_single_name_aliases_match(self):
        self.assertEqual(name_score("Aoriqileng", "Qileng Aori"), 100)
        self.assertEqual(name_score("Sumudaerji", "Su Mudaerji"), 100)

    def test_sherdog_parser_reads_methods_other_results_and_streak(self):
        html = """
        <span class="fn">Test Fighter</span>
        <div class="wins"><div class="winloses"><span>Wins</span><span>10</span></div>
          <div class="meter-title">KO/TKO</div><div class="meter"><span class="pl">4</span></div>
          <div class="meter-title">Submissions</div><div class="meter"><span class="pl">3</span></div>
          <div class="meter-title">Decisions</div><div class="meter"><span class="pl">2</span></div>
          <div class="meter-title">Other</div><div class="meter"><span class="pl">1</span></div></div>
        <div class="loses"><div class="winloses"><span>Losses</span><span>2</span></div>
          <div class="meter-title">KO/TKO</div><div class="meter"><span class="pl">1</span></div>
          <div class="meter-title">Submissions</div><div class="meter"><span class="pl">0</span></div>
          <div class="meter-title">Decisions</div><div class="meter"><span class="pl">1</span></div></div>
        <table class="new_table fighter"><tr><td>NC</td></tr><tr><td>win</td></tr><tr><td>win</td></tr><tr><td>loss</td></tr></table>
        """
        profile = parse_sherdog_profile(html, "https://www.sherdog.com/fighter/test-1")
        self.assertEqual(profile["Record_Wins"], 10)
        self.assertEqual(profile["Other_Wins"], 1)
        self.assertEqual(profile["Decision_Losses"], 1)
        self.assertEqual(profile["Streak"], "2")

    def test_ufc_parser_reads_official_win_methods_style_image_and_rank(self):
        html = """
        <meta property="og:image" content="https://example.test/fighter.jpg">
        <h1 class="hero-profile__name">Test Fighter</h1>
        <div class="hero-profile__division-body">10-2-0 (W-L-D)</div>
        <div class="hero-profile__tag">#3</div>
        <div class="c-stat-3bar__group"><span class="c-stat-3bar__label">KO/TKO</span><span class="c-stat-3bar__value">4</span></div>
        <div class="c-stat-3bar__group"><span class="c-stat-3bar__label">SUB</span><span class="c-stat-3bar__value">3</span></div>
        <div class="c-stat-3bar__group"><span class="c-stat-3bar__label">DEC</span><span class="c-stat-3bar__value">3</span></div>
        <div class="c-bio__field"><span class="c-bio__label">Fighting style</span><span class="c-bio__text">Wrestler</span></div>
        """
        profile = parse_ufc_profile(html, "https://www.ufc.com/athlete/test-fighter")
        self.assertEqual(profile["KO_TKO_Wins"], 4)
        self.assertEqual(profile["style"], "Wrestler")
        self.assertEqual(profile["Rank"], "3")
        self.assertEqual(profile["ImageURL"], "https://example.test/fighter.jpg")

    def test_wikipedia_parser_stays_inside_mma_record(self):
        html = """
        <table class="infobox">
          <tr><th>Mixed martial arts record</th></tr>
          <tr><th>Wins</th><td>10</td></tr><tr><th>By knockout</th><td>4</td></tr>
          <tr><th>By submission</th><td>3</td></tr><tr><th>By decision</th><td>3</td></tr>
          <tr><th>Losses</th><td>2</td></tr><tr><th>By knockout</th><td>1</td></tr>
          <tr><th>By submission</th><td>0</td></tr><tr><th>By decision</th><td>1</td></tr>
          <tr><th>Professional boxing record</th></tr><tr><th>Wins</th><td>99</td></tr>
        </table>
        """
        profile = parse_wikipedia_profile(html)
        self.assertEqual(profile["Record_Wins"], 10)
        self.assertEqual(profile["Decision_Losses"], 1)

    def test_merge_keeps_source_priority_and_zero_record_inference(self):
        merged, sources = merge_profiles([
            ("sherdog", {"KO_TKO_Wins": 4}),
            ("ufc.com", {"KO_TKO_Wins": 5, "Submission_Wins": 2}),
        ], 6, 0)
        self.assertEqual(merged["KO_TKO_Wins"], "4")
        self.assertEqual(sources["KO_TKO_Wins"], "sherdog")
        self.assertEqual(merged["Decision_Losses"], "0")


if __name__ == "__main__":
    unittest.main()
