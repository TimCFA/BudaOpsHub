"""The Set Ups frame (Tim, Oct 18 2026): one pinned day strip (FOH/BOH, a
week back, six two-line day tiles, a week forward), a one-line status row
(the day, when it was updated, Refresh, Set up / Coach on the full site), the
shift changes and all-day events as one chip row, closed daypart cards as two
lines, the daypart on the clock opening by itself with a NOW tag, and the
tier key once under the cards.

Run: python3 -m unittest discover tests
"""
import os
import re
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..')


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding='utf-8') as f:
        return f.read()


def block(src, start, end):
    """The source between the first `start` and the next `end` after it."""
    i = src.index(start)
    return src[i:src.index(end, i)]


class DayStrip(unittest.TestCase):
    def test_one_strip_with_side_arrows_and_days(self):
        page = read('cfa-buda-ops-hub-complete.html')
        strip = block(page, '<div class="su-strip" id="suStrip">', '<select id="daySelect"')
        order = [m for m in re.findall(r'id="(posToggle|setupsPrevWeekBtn|dayPicker|setupsNextWeekBtn)"', strip)]
        self.assertEqual(order, ['posToggle', 'setupsPrevWeekBtn', 'dayPicker', 'setupsNextWeekBtn'])
        self.assertIn('<select id="daySelect" style="display:none;"></select>', page)     # the hidden select stays: it holds the chosen day
        self.assertIn('<div id="daySelectedInfo" class="su-status"></div>', page)
        for gone in ('setupsWeekToggle', 'su-week-toggle-btn', 'setups-week-nav', 'day-info-bar'):
            self.assertNotIn(gone, page)

    def test_arrows_move_a_week(self):
        js = read('static', 'js', 'daypicker-and-positions.js')
        self.assertIn("document.getElementById('setupsPrevWeekBtn').addEventListener('click', ()=>{\n  setSetupsWeekOffset(setupsWeekOffset - 1);", js)
        self.assertIn("document.getElementById('setupsNextWeekBtn').addEventListener('click', ()=>{\n  setSetupsWeekOffset(setupsWeekOffset + 1);", js)
        self.assertNotIn('su-week-toggle-btn', js)

    def test_two_line_tiles_today_outlined_chosen_filled(self):
        js = read('static', 'js', 'daypicker-and-positions.js')
        tile = block(js, 'picker.innerHTML = days.map(d=>`<button type="button" class="day-pill', '</button>`')
        self.assertIn("${d.date === targetValue ? 'active' : ''} ${d.date === today ? 'is-today' : ''}", tile)
        self.assertIn('<small>${d.label.slice(0, 3)}</small><b>${d.dayNum}</b>', tile)
        self.assertIn('aria-pressed="${d.date === targetValue}"', tile)
        self.assertIn("dayNum: d.getDate()", js)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.su-strip .day-pill.is-today{border-color:var(--cfa-red);}', css)
        self.assertIn('.su-strip .day-pill.active{background:var(--cfa-red);border-color:var(--cfa-red);}', css)

    def test_strip_is_pinned(self):
        css = read('static', 'css', 'theme-cfa.css')
        self.assertRegex(css, r'\.su-strip\{position:sticky;top:0;z-index:\d+;')
        self.assertIn('.su-dp{scroll-margin-top:', css)     # the card that opens itself lands under the strip


class StatusRow(unittest.TestCase):
    def test_day_updated_refresh_and_mode_on_one_line(self):
        js = read('static', 'js', 'setups-sheet.js')
        fn = block(js, 'function suStatusHtml(dateISO){', '\n}\n')
        self.assertIn('<span class="su-status-date">${escapeHtml(suShortDate(dateISO))}</span>', fn)
        self.assertIn('<span class="su-status-upd" role="status"${stamp ? ` title="Updated ${escapeHtml(formatLastUpdated(lastUpdated[dateISO]))}"` : \'\'}>${note}</span>', fn)
        self.assertIn("`<span class=\"su-status-upd-k\">Updated </span>${escapeHtml(stamp)}`", fn)
        self.assertIn('class="su-status-refresh su-refresh-btn ${suRefresh.busy ? \'is-busy\' : \'\'}" data-su-refresh="1" aria-label="Refresh the set up"', fn)
        self.assertIn("""<div class="su-mode" role="group" aria-label="View">${btn('sheet', 'Set up')}${btn('coach', 'Coach')}</div>""", fn)
        self.assertNotIn('suModeBarHtml', read('static', 'js', 'setups-board.js'))
        self.assertIn("suShortDate(iso)", read('static', 'js', 'daypicker-and-positions.js'))
        self.assertIn("{weekday: 'short', month: 'short', day: 'numeric'}", read('static', 'js', 'daypicker-and-positions.js'))
        # Refresh keeps its messages; the refresh note is not hidden on a 360px phone.
        self.assertIn("suRefresh.at ? `${escapeHtml(suRefresh.text)} · ${escapeHtml(formatShortTime(suRefresh.at))}${esSpan(suRefresh.es)}`", fn)
        self.assertNotIn('su-refresh-note', fn)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.su-status-date{font-family:var(--font-display);font-size:20px;font-weight:700;white-space:nowrap;', css)
        self.assertIn('@media (max-width:430px){ body:not(.launch-mode) .su-status-upd-k{display:none;} }', css)
        self.assertRegex(css, r'\.su-status-refresh\{flex:none;width:34px;height:34px;padding:0;border-radius:999px;')
        self.assertIn('body.launch-mode .su-mode,', read('static', 'css', 'main.css'))   # the team never sees Set up / Coach

    def test_short_stamp(self):
        js = read('static', 'js', 'setups-sheet.js')
        fn = block(js, 'function suUpdatedStamp(ts){', '\n}\n')
        self.assertIn("return toLocalISODate(d) === today ? d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}) : d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});", fn)

    def test_status_row_is_wired(self):
        js = read('static', 'js', 'daypicker-and-positions.js')
        self.assertIn("el.innerHTML = dateISO && typeof suStatusHtml === 'function' ? suStatusHtml(dateISO) : '';", js)
        self.assertIn("function renderAllDayparts(){\n  const dayName = document.getElementById('daySelect').value;\n  renderSetupsStatus();", js)
        self.assertIn("if(infoContainerId === 'daySelectedInfo'){ renderSetupsStatus(); return; }", js)
        sheet = read('static', 'js', 'setups-sheet.js')
        self.assertIn("document.getElementById('daySelectedInfo').addEventListener('click', e=>{\n  const mode = e.target.closest('[data-su-mode]');\n  if(mode){ suSetMode(mode.dataset.suMode); renderAllDayparts(); return; }\n  if(e.target.closest('[data-su-refresh]')) suRunRefresh();", sheet)


class ChipRow(unittest.TestCase):
    def test_changes_chip_and_event_chips_in_one_row(self):
        board = read('static', 'js', 'setups-board.js')
        fn = block(board, 'function suChipsRowHtml(section, date){', '\n}\n')
        self.assertIn("rosterChangesChipHtml(section, date) : '') + suDayEventChipsHtml(date)", fn)
        self.assertIn('<div class="su-chips-row" aria-label="Today">${chips}</div>', fn)
        self.assertIn("return eventsAllDay(date).map(eventChipHtml).join('');", board)
        self.assertEqual(board.count('${suChipsRowHtml(section, date)}'), 2)     # the Set up view and Coach
        for gone in ('suAllDayEventsHtml', 'su-day-events', 'rosterChangesHtml(section, date)'):
            self.assertNotIn(gone, board)
        self.assertIn("const evChip = t.closest('.su-chips-row .ev-chip');\n  if(evChip){ evChip.classList.toggle('is-full'); return; }", board)

    def test_changes_chip_opens_the_list_below(self):
        rc = read('static', 'js', 'roster-changes.js')
        chip = block(rc, 'function rosterChangesChipHtml(side, date){', '\n}\n')
        self.assertIn("""<button type="button" class="su-rowchip su-chip-changes ${rcOpen ? 'is-open' : ''}" data-rc-toggle="1" aria-expanded="${rcOpen}">""", chip)
        self.assertIn('<span class="su-changes-count" aria-label="${n} change${n === 1 ? \'\' : \'s\'}">${n}</span>', chip)
        self.assertIn("Shift changes${esHtml('Shift changes')}", chip)
        body = block(rc, 'function rosterChangesBodyHtml(side, date){', '\n}\n')
        self.assertIn("if(!rcOpen || (!changes.length && !otherN)) return '';", body)
        self.assertIn('<div class="su-changes is-open" role="note">', body)
        self.assertNotIn('su-changes-head', rc)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.su-chip-changes{border-color:#C47A00;color:#8A5600;background:#FFF8EA;}', css)
        self.assertIn('.su-chips-row{display:flex;align-items:center;gap:6px;overflow-x:auto;', css)


class DaypartCards(unittest.TestCase):
    def test_closed_card_is_two_lines(self):
        board = read('static', 'js', 'setups-board.js')
        card = block(board, 'function suDaypartCardHtml(section, date, dp, i, open, openHtml, m, pill){', '\n}\n')
        self.assertIn("${open || pill ? suNumbersLineHtml(date, dp, pill) : ''}", card)
        self.assertIn("${open || pill ? suEventsLineHtml(section, date, dp, i) : ''}", card)
        self.assertIn("${(open || pill) && (leadBtn || fillBtn) ? `<div class=\"su-dp-sub\"${toggle}>${leadBtn}${fillBtn}</div>` : ''}", card)
        self.assertIn("${!open && !pill ? suDaypartBriefHtml(section, date, dp) : ''}", card)
        brief = block(board, 'function suDaypartBriefHtml(section, date, dp){', '\n}\n')
        self.assertIn("${lead ? `Lead: ${escapeHtml(suDisplayName(lead))}` : 'Lead: choose'}", brief)
        self.assertIn("""class="su-dp-brief-lead ${lead ? '' : 'is-none'} ${!lead && !suLeadIsPressing(section, date, dp) ? 'is-quiet' : ''}" data-su-lead-open="1\"""", brief)
        self.assertIn("`<span><b>${escapeHtml(sales)}</b> projected${esHtml('projected')}</span>`", brief)
        self.assertIn("`<span><b>${escapeHtml(goal)}</b>/labor hr${esHtml('per labor hour')}</span>`", brief)
        self.assertIn("if(!leadHtml && !nums.length) return '';", brief)
        self.assertIn("const leadHtml = section !== 'foh' ? ''", brief)     # BOH has no Lead Captain
        self.assertIn('suCanChooseLead() ?', brief)                         # only Team Leads and directors pick one (Oct 25 2026)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.su-dp-brief-lead{display:inline;border:0;background:none;padding:0;margin:0;font:inherit;font-weight:700;color:var(--cfa-navy);', css)
        self.assertRegex(css, r'\.su-dp-brief\{display:block;[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')
        self.assertIn('.su-dp-brief-lead.is-none{color:var(--cfa-red);}', css)
        self.assertIn('.su-dp-brief-lead.is-none.is-quiet{color:var(--text-secondary);}', css)

    def test_lead_choose_is_red_only_now_and_next(self):
        """Six red "Lead: choose" labels shouted on every closed card, dayparts
        already over included (Oct 2026). Red for today's daypart on the clock
        and the next one; grey anywhere else, still a tap away."""
        board = read('static', 'js', 'setups-board.js')
        fn = block(board, 'function suLeadIsPressing(section, date, dp){', '\n}\n')
        self.assertIn("if(date !== today) return false;", fn)
        self.assertIn("return i >= nowIdx && i <= nowIdx + 1;", fn)

    def test_banner_count_is_what_is_open(self):
        """The pill read "8/9" while three spots sat red: a spot filled below
        the headcount line made up for a skipped one above it (Oct 2026). Now
        "3 open" (red) while spots up to the headcount are empty, else
        filled/on shift as before; the Coach chips say the same thing."""
        board = read('static', 'js', 'setups-board.js')
        count = block(board, 'function suDaypartOpenCount(section, date, dp, i){', '\n}\n')
        self.assertIn("const open = slots.slice(0, onShift).filter(s => !posAssignments[key + '||' + s]).length;", count)
        text = block(board, 'function suDaypartFillText(section, date, dp, i, count){', '\n}\n')
        self.assertIn("return open ? `${open} open${esLine('N open', open)}` : onShift ? `${filled}/${onShift}` : filled ? `${filled} placed${esLine('N placed', filled)}` : '—';", text)
        self.assertIn("""`<span class="su-dp-fill ${count.open && !suDaypartIsOver(section, date, dp) ? 'is-short' : ''}">""", board)
        over = block(board, 'function suDaypartIsOver(section, date, dp){', '\n}\n')
        self.assertIn("if(date < today) return true;", over)
        self.assertIn("return date === today && i < nowIdx;", over)
        chips = block(board, 'function suDaypartChipsHtml(section, date, current){', '\n}\n')
        self.assertIn('<span class="su-chip-fill">${suDaypartFillText(section, date, dp, i)}</span>', chips)
        self.assertNotIn('filled}/${onShift}', chips)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertIn('.su-dp .su-dp-fill.is-short{background:#FBE3E4;color:var(--cfa-dark-red);}', css)

    def test_arrival_redraw_waits_for_open_sheets(self):
        """The half-minute arrival check looked for `.modal.active`, a class
        the page doesn't have, so a note being typed was redrawn under the
        leader's thumb. It asks the sync's own check now (stateDialogOpen) and
        waits out a drag."""
        sheet = read('static', 'js', 'setups-sheet.js')
        self.assertNotIn(".modal.active", sheet)
        self.assertIn("|| suDrag || (typeof stateDialogOpen === 'function' && stateDialogOpen())) return;", sheet)

    def test_no_emoji_on_set_ups(self):
        """Line icons, never emoji (theme-cfa.css). The cup on a planned break,
        the split and flag buttons and the Develop PEA note were the last ones."""
        # Pictographs and the dingbat emoji; the text glyphs the board styles itself (★ development, ✓ in toasts) are not these.
        emoji = re.compile('[\U0001F300-\U0001FAFF☔-☕⚠-⛿✀-✒✔-➿]')
        for name in ('setups-board.js', 'setups-sheet.js', 'daypicker-and-positions.js', 'setup-develop.js', 'setup-fill.js',
                     'setup-leaders.js', 'setup-planb.js', 'setup-evaluate.js', 'setup-rules.js'):
            src = read('static', 'js', name)
            self.assertIsNone(emoji.search(src), f'{name} still has an emoji')
        page = read('cfa-buda-ops-hub-complete.html')
        split = block(page, '<div class="overlay" id="vacancyModal">', '</div>\n  </div>')
        self.assertIsNone(emoji.search(split), 'the Find Coverage sheet still has an emoji')
        self.assertIn('const SU_ICON_CUP_SM =', read('static', 'js', 'setups-sheet.js'))

    def test_no_dead_set_ups_helpers(self):
        """Gone in Oct 2026: the generic renderDayPicker nothing called, the
        currency helper nothing called, the inline onclick on the coverage
        list, and the redundant status-row redraws after renderAllDayparts
        (renderAllDayparts draws the status row itself)."""
        js = read('static', 'js', 'daypicker-and-positions.js')
        self.assertNotIn('function renderDayPicker(', js)
        self.assertNotIn('formatAndUpdateCurrency', js)
        self.assertNotIn('selectVacancyOption', js)
        self.assertNotIn('onclick=', js)
        self.assertIn("data-vacancy-pick=", js)
        self.assertNotIn("renderAllDayparts();\n  updateSelectedDayInfo('daySelect', 'daySelectedInfo');", js)
        self.assertIn('function updateSelectedDayInfo(', js)      # the Safe Count and roster import pages still use it

    def test_now_daypart_opens_itself_once(self):
        board = read('static', 'js', 'setups-board.js')
        self.assertIn("let suCardsTouched = {foh: false, boh: false};", board)
        self.assertIn("let suAutoOpened = '';", board)
        cards = block(board, 'function suDaypartCardsHtml(section, date){', '\n}\n')
        self.assertIn("if(date === today && !open.size && !suCardsTouched[section]){\n    const now = suDefaultDaypart(section, date);\n    open.add(now);\n    suSelectedDaypart[section] = now;\n    suAutoOpened = now;", cards)
        self.assertEqual(board.count('suCardsTouched[sec] = true;'), 1)
        self.assertEqual(board.count('suCardsTouched[currentPosSection] = true;'), 1)
        self.assertIn("suCardsTouched = {foh: false, boh: false};", block(board, 'function suCurrentDaypart(section, date){', '\n}\n'))
        card = block(board, 'function suDaypartCardHtml(section, date, dp, i, open, openHtml, m, pill){', '\n}\n')
        self.assertIn("const isNow = date === today && suDefaultDaypart(section, date) === dp.name;", card)
        self.assertIn("""${isNow ? '<span class="su-dp-now">now</span>' : ''}""", card)
        self.assertIn("${isNow ? 'is-now' : ''}", card)
        js = read('static', 'js', 'daypicker-and-positions.js')
        self.assertIn("if(typeof suAutoOpened !== 'undefined' && suAutoOpened){", js)
        self.assertIn("card.scrollIntoView({block: 'start'});", js)
        css = read('static', 'css', 'theme-cfa.css')
        self.assertRegex(css, r'\.su-dp-now\{[^}]*background:var\(--cfa-red\);color:#fff;')

    def test_tier_key_once_under_the_cards(self):
        board = read('static', 'js', 'setups-board.js')
        self.assertIn("return `<div class=\"su-dp-list\">${cards}</div>${open.size && typeof suTierKeyHtml === 'function' ? suTierKeyHtml() : ''}`;", board)
        sheet = read('static', 'js', 'setups-sheet.js')
        self.assertIn("return `<div class=\"su-sheet-table\">${zones}</div>`;", block(sheet, 'function suSheetViewHtml(', '\n}\n'))
        self.assertNotIn('${suTierKeyHtml()}', sheet)


class Spanish(unittest.TestCase):
    def test_boh_phrases_are_in_the_glossary(self):
        es = read('static', 'js', 'spanish.js')
        for key in ('projected', 'per labor hour', 'Shift changes', 'Checking', 'none on SIDE', 'N still placed', 'since the schedule was posted'):
            self.assertIn(f"'{key}':", es)


class SofterLook(unittest.TestCase):
    """Tim, Oct 19 2026: the look from the mock, nothing about how it works."""
    def test_needed_open_spot_says_choose(self):
        sheet = read('static', 'js', 'setups-sheet.js')
        self.assertIn("""return t.needed ? `<span class="su-row-choose">+ Choose${esHtml('Choose')}</span>` : '<span class="su-row-open">—</span>';""", sheet)
        self.assertIn("'Choose': 'Elegir',", read('static', 'js', 'spanish.js'))

    def test_rows_are_cards_and_the_picker_is_two_across(self):
        css = read('static', 'css', 'theme-cfa.css')
        self.assertRegex(css, r'#allDayparts \.su-sheet-list \.su-rowwrap\{background:var\(--cfa-white\);border:1px solid var\(--border\);border-radius:14px;')
        self.assertIn('#allDayparts .su-sheet-list .su-row-who{color:var(--cfa-navy);}', css)
        self.assertIn('#allDayparts .su-sheet-list .su-row-name{justify-content:flex-end;text-align:right;', css)
        self.assertRegex(css, r'#posModalOptions\{display:grid;grid-template-columns:1fr 1fr;')
        # The wide choices still span the sheet.
        self.assertIn('#posModalOptions .more-option,#posModalOptions .split-option,#posModalOptions .unassign-option{grid-column:1 / -1;}', css)
        # Scoped: the other pickers that share .pos-option are untouched.
        self.assertNotRegex(css, r'(^|\})\.pos-option-list\{display:grid')


if __name__ == '__main__':
    unittest.main()
