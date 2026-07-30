// i18n.js — all interface copy, Polish first. Plural-aware.

export const STR = {
  pl: {
    // nav / hero
    nav_how: 'Jak to działa',
    nav_new: 'Załóż składkę',
    hero_eyebrow: 'Wspólne wydatki bez rejestracji',
    hero_sub: 'Wyjazd, mieszkanie, prezent — wszystkie wydatki lądują w jednym kotle. My liczymy, kto komu ile, żebyście wy nie musieli.',
    hero_cta: 'Załóż składkę',
    hero_demo: 'Zobacz przykład',
    hero_foot: 'Bez kont · bez instalowania · dane zostają u was',

    // acts
    acts_h: 'Trzy ruchy i po sprawie',
    act1_t: 'Wrzucacie',
    act1_d: 'Każdy dorzuca wydatki wtedy, kiedy je robi. Paragon za paragonem, prosto z telefonu.',
    act2_t: 'Widzicie',
    act2_d: 'Bilans liczy się sam, co do grosza. Od razu widać, kto jest na plusie, a kto korzystał z życia.',
    act3_t: 'Rozliczacie się',
    act3_d: 'Najmniejsza możliwa liczba przelewów. Zamiast dziesięciu „oddam ci potem” — jeden przelew i spokój.',

    // create
    create_h: 'Nowa składka',
    create_name_l: 'Na co się składacie?',
    create_name_ph: ['Majówka w Zakopanem', 'Mieszkanie na Woli', 'Prezent dla Maćka', 'Sylwester w Pradze', 'Żagle na Mazurach'],
    create_people_l: 'Kto się składa?',
    create_people_ph: 'Wpisz imię i naciśnij Enter…',
    create_people_hint: 'Minimum dwie osoby. Możesz wkleić całą listę po przecinku.',
    create_currency_l: 'Waluta',
    create_go: 'Otwórz kocioł',
    create_need_two: 'Dodaj co najmniej dwie osoby',
    saved_h: 'Wasze składki',
    saved_open: 'Otwórz',
    saved_delete_confirm: 'Usunąć tę składkę? Tego nie da się cofnąć.',

    // kitty screen
    back: 'Wszystkie składki',
    share: 'Udostępnij',
    share_done: 'Link skopiowany. Wyślijcie go grupie — cała składka jest zapisana w samym linku.',
    add_person: 'Dodaj osobę',
    add_person_ph: 'Imię…',
    person_has_expenses: 'Ta osoba ma wydatki albo udziały — najpierw je usuń.',

    // quick add
    qa_h: 'Nowy wydatek',
    qa_payer: 'Zapłacił(a)',
    qa_what: 'Za co?',
    qa_title_ph: 'np. zakupy, paliwo, kolacja…',
    qa_amount_ph: '0,00',
    qa_add: 'Wrzuć do kotła',
    qa_more: 'Podział i data',
    qa_less: 'Zwiń szczegóły',
    qa_among: 'Za kogo?',
    qa_mode_equal: 'Po równo',
    qa_mode_weights: 'Wagi',
    qa_mode_exact: 'Dokładnie',
    qa_date: 'Data',
    qa_err_amount: 'Kwota wygląda podejrzanie — spróbuj np. 12,50',
    qa_err_title: 'Napisz chociaż słowo — za co to było?',
    qa_err_among: 'Wybierz przynajmniej jedną osobę',
    qa_err_exact: 'Kwoty muszą się sumować do całości',
    qa_weights_hint: 'Więcej wag = większa część. Np. 2 dla pary, 1 dla singla.',

    // expenses
    ex_h: 'Wydatki',
    ex_empty: 'Kocioł jest pusty. Wrzućcie pierwszy wydatek — resztą zajmiemy się my.',
    today: 'Dzisiaj',
    yesterday: 'Wczoraj',
    ex_paid_by: 'zapłacił(a)',
    ex_for: 'za',
    ex_all: 'wszystkich',
    ex_save: 'Zapisz',
    ex_cancel: 'Anuluj',
    ex_delete: 'Usuń',
    ex_deleted: 'Wydatek usunięty.',
    undo: 'Cofnij',

    // balances
    bal_h: 'Bilans',
    bal_plus: 'do zwrotu',
    bal_minus: 'do dopłaty',
    bal_zero: 'na zero',

    // settlement
    st_h: 'Rozliczenie',
    st_sub: 'Najkrótsza droga do zgody',
    st_empty: 'Wszystko wyrównane. Piękna rzecz.',
    st_paid: 'zapłacone',
    st_copy: 'Skopiuj podsumowanie',
    st_copied: 'Podsumowanie w schowku.',
    st_gives: 'przelewa',

    // stats
    stat_total: 'Razem w kotle',
    stat_perhead: 'Średnio na osobę',
    stat_cats: 'Na co poszło',

    // categories
    cat_food: 'Jedzenie',
    cat_groceries: 'Spożywcze',
    cat_transport: 'Transport',
    cat_stay: 'Nocleg',
    cat_drinks: 'Napoje',
    cat_tickets: 'Bilety i wstępy',
    cat_gear: 'Sprzęt',
    cat_other: 'Inne',

    // footer
    foot_privacy: 'Wszystko liczy się w twojej przeglądarce. Nic nie wysyłamy na żaden serwer — link do składki jest jej jedyną kopią poza tym urządzeniem.',
    foot_credit: 'Zaprojektowane i zbudowane w całości przez Claude (Fable).',
    foot_code: 'Kod źródłowy',

    // plurals
    person_pl: ['osoba', 'osoby', 'osób'],
    expense_pl: ['wydatek', 'wydatki', 'wydatków'],
  },

  en: {
    nav_how: 'How it works',
    nav_new: 'Start a pot',
    hero_eyebrow: 'Group expenses, no sign-up',
    hero_sub: 'A trip, a flat, a gift — every expense lands in one shared pot. We do the who-owes-whom, so you never have to.',
    hero_cta: 'Start a pot',
    hero_demo: 'See an example',
    hero_foot: 'No accounts · nothing to install · your data stays with you',

    acts_h: 'Three moves and it’s done',
    act1_t: 'You toss in',
    act1_d: 'Everyone adds expenses as they happen. Receipt after receipt, straight from a phone.',
    act2_t: 'You see',
    act2_d: 'The balance computes itself, to the cent. You instantly see who’s ahead and who’s been living well.',
    act3_t: 'You settle',
    act3_d: 'The fewest transfers possible. Instead of ten "I’ll pay you back" — one transfer and peace.',

    create_h: 'New pot',
    create_name_l: 'What are you pooling for?',
    create_name_ph: ['May weekend in Zakopane', 'Flat on Wola', 'Gift for Maciek', 'New Year’s in Prague', 'Sailing in Masuria'],
    create_people_l: 'Who’s chipping in?',
    create_people_ph: 'Type a name, press Enter…',
    create_people_hint: 'At least two people. You can paste a comma-separated list.',
    create_currency_l: 'Currency',
    create_go: 'Open the pot',
    create_need_two: 'Add at least two people',
    saved_h: 'Your pots',
    saved_open: 'Open',
    saved_delete_confirm: 'Delete this pot? This cannot be undone.',

    back: 'All pots',
    share: 'Share',
    share_done: 'Link copied. Send it to the group — the whole pot is stored inside the link itself.',
    add_person: 'Add person',
    add_person_ph: 'Name…',
    person_has_expenses: 'This person has expenses or shares — remove those first.',

    qa_h: 'New expense',
    qa_payer: 'Paid by',
    qa_what: 'For what?',
    qa_title_ph: 'e.g. groceries, fuel, dinner…',
    qa_amount_ph: '0.00',
    qa_add: 'Toss it in',
    qa_more: 'Split & date',
    qa_less: 'Hide details',
    qa_among: 'For whom?',
    qa_mode_equal: 'Evenly',
    qa_mode_weights: 'Weights',
    qa_mode_exact: 'Exactly',
    qa_date: 'Date',
    qa_err_amount: 'That amount looks off — try e.g. 12.50',
    qa_err_title: 'Write at least a word — what was it for?',
    qa_err_among: 'Pick at least one person',
    qa_err_exact: 'The amounts must add up to the total',
    qa_weights_hint: 'More weight = bigger share. E.g. 2 for a couple, 1 for a single.',

    ex_h: 'Expenses',
    ex_empty: 'The pot is empty. Toss in the first expense — we’ll handle the rest.',
    today: 'Today',
    yesterday: 'Yesterday',
    ex_paid_by: 'paid',
    ex_for: 'for',
    ex_all: 'everyone',
    ex_save: 'Save',
    ex_cancel: 'Cancel',
    ex_delete: 'Delete',
    ex_deleted: 'Expense deleted.',
    undo: 'Undo',

    bal_h: 'Balance',
    bal_plus: 'gets back',
    bal_minus: 'chips in',
    bal_zero: 'even',

    st_h: 'Settling up',
    st_sub: 'The shortest path to peace',
    st_empty: 'All even. A beautiful thing.',
    st_paid: 'paid',
    st_copy: 'Copy summary',
    st_copied: 'Summary copied.',
    st_gives: 'transfers',

    stat_total: 'Total in the pot',
    stat_perhead: 'Average per person',
    stat_cats: 'Where it went',

    cat_food: 'Food',
    cat_groceries: 'Groceries',
    cat_transport: 'Transport',
    cat_stay: 'Stay',
    cat_drinks: 'Drinks',
    cat_tickets: 'Tickets & entry',
    cat_gear: 'Gear',
    cat_other: 'Other',

    foot_privacy: 'Everything is computed in your browser. Nothing is sent to any server — the share link is the pot’s only copy outside this device.',
    foot_credit: 'Designed and built entirely by Claude (Fable).',
    foot_code: 'Source code',

    person_pl: ['person', 'people', 'people'],
    expense_pl: ['expense', 'expenses', 'expenses'],
  },
};

/** Polish-aware plural: pick from [one, few, many]. Works for en too (one/other). */
export function plural(n, forms, lang = 'pl') {
  if (lang === 'en') return n === 1 ? forms[0] : forms[1];
  if (n === 1) return forms[0];
  const d = n % 10, h = n % 100;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return forms[1];
  return forms[2];
}
