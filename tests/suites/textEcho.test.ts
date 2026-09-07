import { queueEcho, resolveEcho } from '@/src/core/utils/textEcho';

// TC-TE-* — who owns the text while someone types. Every value the field sends
// up comes back as a prop one render later; a value that arrives LATE is an old
// echo, and adopting it retypes the field and throws the caret to the end.

describe('resolveEcho', () => {
  it('TC-TE-01 a value the field never sent up is a real instruction', () => {
    expect(resolveEcho('30', [])).toEqual({ adopt: true, pending: [] });
  });

  it('TC-TE-02 the echo of the last keystroke changes nothing and clears the queue', () => {
    expect(resolveEcho('ab', ['ab'])).toEqual({ adopt: false, pending: [] });
  });

  it('TC-TE-03 an OLD echo is refused, and the newer keystrokes stay pending', () => {
    expect(resolveEcho('acd', ['acd', 'abcd'])).toEqual({
      adopt: false,
      pending: ['abcd'],
    });
  });

  it('TC-TE-04 the fresh echo behind a refused one still empties the queue', () => {
    const stale = resolveEcho('acd', ['acd', 'abcd']);
    expect(resolveEcho('abcd', stale.pending)).toEqual({
      adopt: false,
      pending: [],
    });
  });

  it('TC-TE-05 an owner change while echoes are pending wins and drops them', () => {
    expect(resolveEcho('50', ['5', '51'])).toEqual({ adopt: true, pending: [] });
  });

  it('TC-TE-06 clearing to empty is adopted when the field never typed empty', () => {
    expect(resolveEcho('', ['a', 'ab'])).toEqual({ adopt: true, pending: [] });
  });

  it('TC-TE-07 an owner that echoes a LOSSY value keeps the typed text', () => {
    expect(resolveEcho('1', ['1'])).toEqual({ adopt: false, pending: [] });
  });
});

describe('queueEcho', () => {
  it('TC-TE-08 queues the expected echo newest last', () => {
    expect(queueEcho(['a'], 'ab')).toEqual(['a', 'ab']);
  });

  it('TC-TE-09 an owner that never echoes cannot grow the queue past 8', () => {
    let pending: string[] = [];
    for (const echo of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']) {
      pending = queueEcho(pending, echo);
    }
    expect(pending).toEqual(['3', '4', '5', '6', '7', '8', '9', '10']);
  });
});
