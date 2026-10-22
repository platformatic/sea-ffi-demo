import { dlopen, suffix } from 'node:ffi'
import { join } from 'node:path'

using library = dlopen(join(import.meta.dirname, `native/message.${suffix}`), {
  print_message: { arguments: ['string'], return: 'void' }
})

library.functions.print_message(process.argv.slice(2).join(' ') || 'Hello from SEA and FFI!')
