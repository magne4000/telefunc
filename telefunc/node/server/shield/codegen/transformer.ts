export { generateShield }

import { readFileSync } from 'fs'
import { Project, VariableDeclarationKind } from 'ts-morph'
import { assert, assertWarning } from '../../../utils'

const typesSrc = readFileSync(`${__dirname}/types.d.ts`).toString()

const generateShield = (
  telefuncFileCode: string
): string => {
  const project = new Project({
    compilerOptions: {
      strict: true
    }
  })

  project.createSourceFile("types.ts", typesSrc)
  const telefuncFileSource = project.createSourceFile("telefunc.ts", telefuncFileCode)
  // this source file is used for evaluating the template literal types' values
  const shieldStrSource = project.createSourceFile("shield-str.ts")

  shieldStrSource.addImportDeclaration({
    moduleSpecifier: "./types",
    namedImports: ["ShieldArrStr"]
  })

  const telefunctions = telefuncFileSource.getFunctions().filter(f => f.isExported())
  const telefunctionNames = telefunctions.flatMap(telefunction => {
    const name = telefunction.getName()
    if (!name) return []
    return [name]
  })
  shieldStrSource.addImportDeclaration({
    moduleSpecifier: "./telefunc",
    namedImports: telefunctionNames
  })

  const tAlias = '__shieldGenerator_t'  // alias for shield.t
  // assign the template literal type to a string
  // then diagnostics are used to get the value of the template literal type
  for (const telefunctionName of telefunctionNames) {
    shieldStrSource.addTypeAlias({
      name: `${telefunctionName}Shield`,
      type: `ShieldArrStr<Parameters<typeof ${telefunctionName}>>`
    })
  }

  const shieldAlias = '__shieldGenerator_shield'  // alias for shield
  telefuncFileSource.addImportDeclaration({
    moduleSpecifier: 'telefunc',
    namedImports: [{
      name: 'shield',
      alias: shieldAlias
    }]
  })
  telefuncFileSource.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: tAlias,
      initializer: `${shieldAlias}.type`,
    }]
  })

  for (const telefunctionName of telefunctionNames) {
    const typeAlias = shieldStrSource.getTypeAlias(`${telefunctionName}Shield`)
    assert(typeAlias, `Failed to get typeAlias '${telefunctionName}Shield'.`)

    const shieldStr = typeAlias.getType().getLiteralValue()

    if (!shieldStr || typeof shieldStr !== 'string') {
      assertWarning(false, `Failed to generate shield() for telefunction ${telefunctionName}()`)
      continue
    }
    const shieldStrWithAlias = shieldStr.replace(/t\./g, `${tAlias}.`)
    telefuncFileSource.addStatements(`${shieldAlias}(${telefunctionName}, ${shieldStrWithAlias}, { __generated: true })`)
  }

  return telefuncFileSource.getText()
}
