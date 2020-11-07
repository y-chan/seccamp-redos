import * as rerejs from 'rerejs';

type NFA =
  | NormalizedNFA
  | NonNormalizedNFA;

type NormalizedNFA = {
  normalized: true;
  states: State[];
  initialState: State;
  acceptingState: State;
};

type NonNormalizedNFA = {
  normalized: false;
  states: State[];
  initialStates: State[];
  acceptingStates: Set<State>;
};

type State = {
  id: string;
  transitions: Transition[];
};

type Transition = {
  char: rerejs.Char | rerejs.EscapeClass | rerejs.Class | rerejs.Dot | null;
  destination: State;
};

class NFABuilder {
  private stateId = 0;

  constructor(
    private pattern: rerejs.Pattern,
  ) {}

  build(): NormalizedNFA {
    return this.buildChild(this.pattern.child);
  }

  private buildChild(node: rerejs.Node): NormalizedNFA {
    switch (node.type) {
      case 'Char':
      case 'EscapeClass':
      case 'Class':
      case 'Dot': {
        const f0 = this.createState({ transitions: [] });
        const d0: Transition = { char: node, destination: f0 };
        const q0 = this.createState({ transitions: [d0] });
        return {
          normalized: true,
          states: [q0, f0],
          initialState: q0,
          acceptingState: f0,
        };
      }
      case 'Disjunction': {
        const childNFAs = node.children.map((child) => this.buildChild(child));
        const childStates = childNFAs.flatMap((nfa) => nfa.states);
        const childInitialStates = childNFAs.map((nfa) => nfa.initialState);
        const childAcceptingStates = childNFAs.map((nfa) => nfa.acceptingState);
        const f0 = this.createState({ transitions: [] });
        const ds1: Transition[] = childAcceptingStates.map((state) => {
          const d1 = {
            char: null,
            destination: f0,
          };
          state.transitions.push(d1);
          return d1;
        });
        const ds0: Transition[] = childInitialStates.map((state) => {
          return {
            char: null,
            destination: state,
          };
        });
        const q0 = this.createState({ transitions: [...ds0] });
        return {
          normalized: true,
          states: [q0, ...childStates, f0],
          initialState: q0,
          acceptingState: f0,
        };
      }
      case 'Sequence': {
        if (node.children.length === 0) {
          const f0 = this.createState({ transitions: [] });
          const d0: Transition = { char: null, destination: f0 };
          const q0 = this.createState({ transitions: [d0] });
          return {
            normalized: true,
            states: [q0, f0],
            initialState: q0,
            acceptingState: f0,
          };
        } else {
          const childNFAs = node.children.map((child) => this.buildChild(child));
          for (let i = 0; i < childNFAs.length - 1; i++) {
            const nfa0 = childNFAs[i];
            const nfa1 = childNFAs[i + 1];
            nfa0.acceptingState.transitions.push(...nfa1.initialState.transitions);
          }
          const q0 = childNFAs[0].initialState;
          const childStates: State[] = [];
          for (const nfa of childNFAs) {
            for (const s of nfa.states) {
              if (s === q0 || s !== nfa.initialState) {
                childStates.push(s);
              }
            }
          }
          const f0 = childNFAs[childNFAs.length - 1].acceptingState;
          return {
            normalized: true,
            states: childStates,
            initialState: q0,
            acceptingState: f0,
          };
        }
      }
      case 'Many': {
        const childNFA = this.buildChild(node.child);
        const f0 = this.createState({ transitions: [] });
        const d3: Transition = { char: null, destination: f0 };
        const d2: Transition = { char: null, destination: f0 };
        const d1: Transition = {
          char: null,
          destination: childNFA.initialState,
        };
        childNFA.acceptingState.transitions.push(d1, d2);
        const d0: Transition = {
          char: null,
          destination: childNFA.initialState,
        }
        const q0 = this.createState({
          transitions: node.nonGreedy ? [d3, d0] : [d0, d3],
        });
        return {
          normalized: true,
          states: [q0, ...childNFA.states, f0],
          initialState: q0,
          acceptingState: f0,
        };
      }
      case 'Capture':
      case 'NamedCapture':
      case 'Group': {
        return this.buildChild(node.child);
      }
      default: {
        throw new Error('Unimplemented!');
      }
    }
  }

  private createState(state: Omit<State, 'id'>): State {
    return {
      id: `q${this.stateId++}`,
      ...state,
    };
  }
}

function eliminateEpsilonTransitions(nfa: NormalizedNFA): NonNormalizedNFA {
  const acceptingStates = new Set([nfa.acceptingState]);
  let modified = true;
  while (modified) {
    modified = false;
    const toEliminate = new Set<Transition>();
    for (const q0 of nfa.states) {
      const q0Transitions: Transition[] = [];
      for (const d0 of q0.transitions) {
        q0Transitions.push(d0);
        const q1 = d0.destination;
        for (const d1 of q1.transitions) {
          if (d1.char === null) {
            if (!q0.transitions.find(({ char, destination }) => char === d0.char && destination === d1.destination)) {
              q0Transitions.push({
                char: d0.char,
                destination: d1.destination,
              });
              modified = true;
            }
            toEliminate.add(d1);
            if (acceptingStates.has(d1.destination)) {
              acceptingStates.add(q1);
            }
          }
        }
      }
      q0.transitions = q0Transitions;
    }
    for (const q0 of nfa.states) {
      q0.transitions = q0.transitions.filter((d0) => !toEliminate.has(d0));
    }
  }
  const initialStates = [nfa.initialState];
  for (const d0 of nfa.initialState.transitions) {
    if (d0.char === null) {
      initialStates.push(d0.destination);
    }
  }
  nfa.initialState.transitions = nfa.initialState.transitions.filter((d0) => d0.char !== null);
  return {
    normalized: false,
    states: nfa.states,
    initialStates,
    acceptingStates,
  };
}

function toDOT(nfa: NFA): string {
  interface Edge {
    src: string;
    dst: string;
    label: string;
  }

  let _id = 0;
  const id = () => `q${_id++}`;
  const stateToId = new Map<State, string>();
  const transitions: Edge[] = [];
  for (const state of nfa.states) {
    if (!stateToId.has(state)) {
      stateToId.set(state, id());
    }
  }
  for (const state of nfa.states) {
    for (const d of state.transitions) {
      transitions.push({
        src: stateToId.get(state)!,
        dst: stateToId.get(d.destination)!,
        label: d.char === null ? 'ε' :
               d.char.type === 'Dot' ? 'Σ' :
               rerejs.nodeToString(d.char),
      });
    }
  }
  let out = '';
  out += `digraph G {\n`;
  const acceptingStates = nfa.normalized ? new Set([nfa.acceptingState]) : nfa.acceptingStates;
  for (const f of acceptingStates) {
    out += `    ${stateToId.get(f)} [shape=doublecircle];\n`;
  }
  const initialStates = nfa.normalized ? [nfa.initialState] : nfa.initialStates;
  for (const q of initialStates) {
    const id = stateToId.get(q)!;
    out += `    ${id}_init [shape = point];\n`;
    out += `    ${id}_init -> ${id};\n`;
  }
  for (const e of transitions.values()) {
    out += `    ${e.src} -> ${e.dst} [label = ${JSON.stringify(e.label)}];\n`;
  }
  out += `}\n`;
  return out;
}

function main() {
  const sources = [
    String.raw`a`,
    String.raw`\s`,
    String.raw`a|b`,
    String.raw`ab`,
    String.raw`a*`,
    String.raw`a*?`,
    String.raw`(?:)`,
    String.raw`(?:a|bc)`,
    String.raw`(a*)*`,
    String.raw`(\w|\d)*`,
    String.raw`(.*)="(.*)"`,
    String.raw`[a-z][0-9a-z]*`,
  ];
  for (const src of sources) {
    console.log(src);
    const pat = new rerejs.Parser(src).parse();
    const enfa = new NFABuilder(pat).build();
    console.log(toDOT(enfa));
    const nfa = eliminateEpsilonTransitions(enfa);
    console.log(toDOT(nfa));
  }
}

if (require.main === module) {
  main();
}
