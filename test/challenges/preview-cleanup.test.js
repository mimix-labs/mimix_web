import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

test('partial preview setup releases earlier renderers and animation frames',()=>{
  // Inject a WebGL allocation failure without depending on GPU exhaustion.
  const source=readFileSync(new URL('../../packages/challenge-mathematics/src/sidebarShapes.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/,'').replaceAll('export ','')
  let created=0,disposed=0
  const frames=new Set()
  class Shape {}
  const THREE={BoxGeometry:Shape,OctahedronGeometry:Shape,CylinderGeometry:Shape,ConeGeometry:Shape,
    WebGLRenderer:class {
      constructor(){if(++created===2)throw Error('WebGL context unavailable')}
      setSize(){} render(){} dispose(){disposed++}
    },
    Scene:class{add(){}},PerspectiveCamera:class{position={}},MeshStandardMaterial:class{dispose(){}},
    Mesh:class{rotation={x:0,y:0}},DirectionalLight:class{position={set(){}}},
  }
  const context=vm.createContext({THREE,console,document:{getElementById(){return{width:90,height:90}}},
    requestAnimationFrame(){const frame=frames.size+1;frames.add(frame);return frame},
    cancelAnimationFrame(id){frames.delete(id)},
  })
  vm.runInContext(source,context)
  assert.throws(()=>vm.runInContext('initPreviews()',context),/WebGL context unavailable/)
  assert.equal(disposed,1)
  assert.equal(frames.size,0)
})
