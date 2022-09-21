if (typeof window === 'undefined') {
    var platform_get_input = require("prompt-sync")({ sigint: true });
} else {
    var platform_get_input = window.prompt;
}

let repl_running = true
let repl_debug_enabled = false
let repl_log_to_console = true
let repl_log_buffer = ""
let repl_log = (msg) => {
    repl_log_buffer += msg + "\n";
    if (repl_log_to_console) console.log(msg)
}
let repl_input = platform_get_input

const REPLLifecycle = {
    init: () => {
        if (repl_debug_enabled) {
            repl_log("(ReplLifeCycle) init() called")
        }
    },
    terminate: () => {
        repl_log("(ReplLifeCycle) terminate() called")
        process.exit(0)
    }
}

const get_compiler_state = () => ({ finished: !repl_running, debug_enabled: repl_debug_enabled })
const repl_clear_buffer = () => repl_log_buffer = ""
const split_into_args = (str) => str.split(" ")
const sanitize_line = (line) => line.trim().replace('\n', '')
const repl_terminate = REPLLifecycle.terminate
const debug = (msg) => repl_debug_enabled ? repl_log(`(ReplInternal) ${msg}`) : null
const success = (msg) => repl_log(`(RSuccess): ${msg}`)
const set_log_function = (func) => repl_log = func
const arg_required = (required_arg) => error(`argument required: ${required_arg}`)
const args_assert = (args, required, limit = true) => {
    if (args.length < required.length) {
        arg_required(required)
        return false
    }

    if ((args.length > required.length) && limit) {
        error('too much arguments')
        return false
    }

    return true
}

const function_call_internal = (name, args) => {
    debug(`${name}(${as_safe_type(args)}) called`)

    internal_functionss[name](args)
}

const function_push_instruction = (func_arg_str) => {
    if (func_arg_str[0] === 'begin') return;
    if (func_arg_str[0] === 'end') return;

    function_stack[current_func].push({
        name: func_arg_str[0],
        args: func_arg_str.slice(1)
    })
}

const error = (err, fatal) => {
    repl_log(`(IonError): ${err}`)
    if (fatal) process.exit(-1)
}

const as_safe_type = (val) => {
    const type = typeof (val)

    if (type === 'string' ||
        type === 'boolean' ||
        type === 'number' ||
        type === 'bigint') {
        return val
    }

    if (type === 'function') {
        return '?function'
    }

    if (type === 'undefined') {
        return 'nilval'
    }

    if (Array.isArray(val)) {
        if (val.length === 0) {
            return '0'
        }
    }

    return JSON.stringify(val)
}

const expand_variables = (arr) => {
    let expanded_values = arr

    // FIXME: need a better way to do this
    arr.map((value) => {
        Object.entries(variable_stack).forEach(([key, val]) => {
            expanded_values.forEach(function (item, i) {
                if (item.includes(`$${key}`)) expanded_values[i] = item.replace(`$${key}`, val)
            });
        })
    })

    return expanded_values
}

let function_stack = { '__main__': [], }
let variable_stack = {}
let current_func = '__main__'

const internal_functionss = {
    dump: () => {
        repl_log(`current function: ${current_func}`)
        repl_log(JSON.stringify(function_stack, null, 2))
        repl_log(`\nvariable stack dump:`)
        repl_log(JSON.stringify(variable_stack, null, 2))
    },
    set: (args) => {
        // we're not doing args_assert because this is a special function

        let str_split = args.join(' ').split('=')

        let lhs = str_split[0]
        let rhs = str_split[1]

        if (!lhs) {
            error('expression requires an lhs (var_name)')
            return
        }

        if (!rhs) {
            error('expression requires an rhs (var_value)')
            return
        }

        // trim out all the leading and trailing whitespace 
        // and other unwanted characters
        lhs = lhs.trim()
        rhs = rhs.trim()

        if (rhs === '?input')
            rhs = repl_input('(Ionite) Ask? ')

        // here, lhs = variable and rhs = value
        variable_stack[lhs] = rhs

        debug(`storing variable ${lhs}: ${rhs}`)
    },
    begin: (args) => {
        if (!args_assert(args, [
            'function? string'
        ])) return false

        let function_name = args[0]

        // add a new function to the function stack
        function_stack[function_name] = []
        // set the current function to it
        current_func = function_name

        debug(`start function '${function_name}'`)
    },
    end: () => {
        // TODO: implement execution tree (call stack)
        current_func = '__main__'

        debug(`end function '${current_func}'`)
    },
    call: (args) => {
        if (!args_assert(args, [
            'function? string'
        ])) return

        let function_name = args[0]

        // is the function in the function stack?
        if (!(function_name in function_stack)) return error(`undefined function '${args[0]}'`)

        // TODO: implement call function
    },
    print: (args) => {
        if (!args_assert(args, [
            'message? string'
        ], false)) return

        repl_log(expand_variables(args).join(' '))
    },

    // The following are some debug symbols
    // TODO: implement a way to turn these off
    __exit__: () => {
        repl_terminate()
    },
    __debug__: (args) => {
        if (!args_assert(args, [
            'should_enable? bool'
        ], false)) return

        repl_debug_enabled = args[0] == "true"
        debug("debug info enabled")
    }
}

const parse_line = (line) => {
    const argv = split_into_args(sanitize_line(line))
    const argc = argv.length

    // ignore empty lines
    if (argv[0] === '')
        return;

    // ignore comments
    if (argv[0].startsWith('#'))
        return;

    if (!(argv[0] in internal_functionss)) {
        error(`undefined function/variable '${argv[0]}'`)
        return;
    }

    function_call_internal(argv[0], argv.slice(1))
    function_push_instruction(argv)
}

const parse = (str) => {
    const lines = str.split("\n")

    for (i = 0; i < lines.length; i++) {
        parse_line(lines[i])
    }
}

const IoniteRepl = {
    functions: {
        call_internal: function_call_internal
    },
    config: {
        set_log_to_console: (bool) => repl_log_to_console = bool,
    },
    lifecycle: REPLLifecycle,
    set_log_function: set_log_function,
    get_output_buffer: () => repl_log_buffer,
    get_state: get_compiler_state,
    eval: parse,
    eval_line: parse_line
}

// export module only for node
if (typeof process === 'object') {
    module.exports = IoniteRepl
}