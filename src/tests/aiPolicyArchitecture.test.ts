// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps finite-window arithmetic out of task-specific prompt construction',()=>{
  // Structural companion to the service routing sentinel: new modules are scanned too.
  // Provider transport may serialize maxOutput, but must not calculate another input budget.
  const files=['src/ai','server'].flatMap(dir=>readdirSync(dir).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f)));
  const violations:string[]=[];
  for(const file of files) {
    if(file===join('src/ai','budget.ts')) continue;
    const ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    const visit=(node:ts.Node)=>{
      if(ts.isBinaryExpression(node)) {
        let windowField=false;
        const inspect=(part:ts.Node)=>{
          if(ts.isPropertyAccessExpression(part) && ['contextWindow','maxOutput'].includes(part.name.text)) windowField=true;
          ts.forEachChild(part,inspect);
        };
        inspect(node);
        if(windowField) violations.push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart()).line+1}`);
      }
      ts.forEachChild(node,visit);
    };
    visit(ast);
  }
  expect(violations).toEqual([]);
});
