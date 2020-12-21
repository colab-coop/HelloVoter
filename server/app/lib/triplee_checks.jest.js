import { calcTripleeNameTrustFactors, evaluateTripleeNames } from './triplee_checks';

describe('evaluateTripleeNames', () => {
  test('detects non-unique names', () => {
    expect(
      evaluateTripleeNames('Bar', 'Quux', [' foo  ', 'Foo', 'Baz'])
    ).toStrictEqual({
      nonUniqueNames: ['Foo'],
      suspiciousNames: [],
      sameAsAmbassadorNames: [],
      sameAsTriplerNames: [],
    });
  });

  test('detects suspicious names', () => {
    expect(
      evaluateTripleeNames('Bar', 'Quux', ['', '2', 'baz'])
    ).toStrictEqual({
      nonUniqueNames: [],
      suspiciousNames: ['', '2'],
      sameAsAmbassadorNames: [],
      sameAsTriplerNames: [],
    });
  });

  test('detects triplees matching ambassador name', () => {
    expect(
      evaluateTripleeNames('bar  ', ' quux', ['  Bar', 'Foo', 'Baz'])
    ).toStrictEqual({
      nonUniqueNames: [],
      suspiciousNames: [],
      sameAsAmbassadorNames: ['  Bar'],
      sameAsTriplerNames: [],
    });
  });

  test('detects triplees matching tripler name', () => {
    expect(
      evaluateTripleeNames('bar  ', ' qux', ['Qux ', 'foo', 'baz'])
    ).toStrictEqual({
      nonUniqueNames: [],
      suspiciousNames: [],
      sameAsAmbassadorNames: [],
      sameAsTriplerNames: ['Qux '],
    });
  });

  test('detects triplees with multiple issues', () => {
    expect(
      evaluateTripleeNames('bar', 'qux', ['  Qux', 'Baz-', 'Baz'])
    ).toStrictEqual({
      nonUniqueNames: ['Baz'],
      suspiciousNames: [],
      sameAsAmbassadorNames: [],
      sameAsTriplerNames: ['  Qux'],
    });
  });
});

function fakeNode(props) {
  return {
    get: (name) => props[name]
  };
}

function fakeAmbassador(first_name, last_name) {
  return fakeNode({first_name, last_name});
}

function fakeTripler(first_name, last_name, triplees) {
  return fakeNode({first_name, last_name, triplees});
}

describe('calcTripleeNameTrustFactors', () => {
  test('with no blemishes', () => {
    expect(
      calcTripleeNameTrustFactors(fakeAmbassador('Hercule', 'Poirot'), [
        fakeTripler(' Fred', ' Flintstone', JSON.stringify([
          'Harry Potter', 'Hermione Granger', 'Ron Weasley'
        ])),
        fakeTripler('Wilma', 'Flintstone ', JSON.stringify([
          'Clark Kent', 'Peter Parker', 'Tony Stark'
        ]))
      ])
    ).toStrictEqual({
      num_suspicious_triplee_names: 0,
      num_triplee_names_matching_ambassador: 0,
      num_triplee_names_matching_tripler: 0,
      num_repeated_triplee_names_beyond_two: 0,
      num_triplers_with_repeated_triplee_names: 0
    });
  });

  test('with triplee names matching ambassador name', () => {
    expect(
      calcTripleeNameTrustFactors(fakeAmbassador('Hercule', 'Poirot'), [
        fakeTripler(' Fred', ' Flintstone', JSON.stringify([
          'Harry Potter', ' \n hercule-poirot', 'Ron Weasley'
        ])),
        fakeTripler('Wilma', 'Flintstone ', JSON.stringify([
          'Clark Kent', 'Peter Parker', '  Wilma. Flintstone \t'
        ]))
      ])
    ).toStrictEqual({
      num_suspicious_triplee_names: 0,
      num_triplee_names_matching_ambassador: 1,
      num_triplee_names_matching_tripler: 1,
      num_repeated_triplee_names_beyond_two: 0,
      num_triplers_with_repeated_triplee_names: 0
    });
  });

  test('with suspicious triplee names', () => {
    expect(
      calcTripleeNameTrustFactors(fakeAmbassador('Hercule', 'Poirot'), [
        fakeTripler(' Fred', ' Flintstone', JSON.stringify([
          'Harry Pppppp', 'Hermione Granger', 'xxxxx'
        ])),
        fakeTripler('Wilma', 'Flintstone ', JSON.stringify([
          'Clark Kent', 'Peter 2 Parker', 'Q',
        ]))
      ])
    ).toStrictEqual({
      num_suspicious_triplee_names: 4,
      num_triplee_names_matching_ambassador: 0,
      num_triplee_names_matching_tripler: 0,
      num_repeated_triplee_names_beyond_two: 0,
      num_triplers_with_repeated_triplee_names: 0
    });
  });

  test('with triplers with repeated triplee names', () => {
    expect(
      calcTripleeNameTrustFactors(fakeAmbassador('Hercule', 'Poirot'), [
        fakeTripler(' Fred', ' Flintstone', JSON.stringify([
          'Harry Potter', ' harry   p’otter ', 'Ron Weasley'
        ])),
        fakeTripler('Wilma', 'Flintstone ', JSON.stringify([
          'Peter Parker', ' Clark---kent ', '  clark\nkent'
        ]))
      ])
    ).toStrictEqual({
      num_suspicious_triplee_names: 0,
      num_triplee_names_matching_ambassador: 0,
      num_triplee_names_matching_tripler: 0,
      num_repeated_triplee_names_beyond_two: 0,
      num_triplers_with_repeated_triplee_names: 2
    });
  });

  test('with two repeated triplee names', () => {
    expect(
      calcTripleeNameTrustFactors(fakeAmbassador('Hercule', 'Poirot'), [
        fakeTripler(' Fred', ' Flintstone', JSON.stringify([
          'Harry Potter', 'Hermione Granger', 'Peter-Parker   '
        ])),
        fakeTripler('Wilma', 'Flintstone ', JSON.stringify([
          'Clark Kent', 'Peter Parker', '  harry\tPOTTER'
        ])),
      ])
    ).toStrictEqual({
      num_suspicious_triplee_names: 0,
      num_triplee_names_matching_ambassador: 0,
      num_triplee_names_matching_tripler: 0,
      num_repeated_triplee_names_beyond_two: 0,
      num_triplers_with_repeated_triplee_names: 0
    });
  });

  test('with more than two repeated triplee names', () => {
    expect(
      calcTripleeNameTrustFactors(fakeAmbassador('Hercule', 'Poirot'), [
        fakeTripler(' Fred', ' Flintstone', JSON.stringify([
          'Harry Potter', ' peter. parker. ', 'Peter-Parker   '
        ])),
        fakeTripler('Wilma', 'Flintstone ', JSON.stringify([
          'Clark Kent', 'Peter Parker', '  harry\tPOTTER'
        ])),
      ])
    ).toStrictEqual({
      num_suspicious_triplee_names: 0,
      num_triplee_names_matching_ambassador: 0,
      num_triplee_names_matching_tripler: 0,
      num_repeated_triplee_names_beyond_two: 1,
      num_triplers_with_repeated_triplee_names: 1
    });
  });
});
