/*
  tags: advanced, fbo

  <p>
  In this demo, it is shown how to implement 3D object picking using a pickBuffer.
  If you click on an object, an outline is drawn around it.
  </p>
*/

const canvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('../regl')({canvas: canvas})
const mat4 = require('gl-mat4')
window.addEventListener('resize', fit(canvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')
var mp = require('mouse-position')(canvas)
var mb = require('mouse-pressed')(canvas)

var viewMatrix = new Float32Array([1, -0, 0, 0, 0, 0.876966655254364, 0.48055124282836914, 0, -0, -0.48055124282836914, 0.876966655254364, 0, 0, 0, -11.622776985168457, 1])
var projectionMatrix = new Float32Array(16)

/*
  Instead of a floating point texture, we use a RGBA8 texture,
  since floating point textures are not available on all devices.

  The pick-buffer contains the ids of all the rendered objects.

  So for every pixel in the pickBuffer, the id of the object that is
  _foremost_ at that pixel is stored(thanks to the Z-buffer!). Thus, if
  we click on a pixel with the mouse, we can easily retrieve the id of
  the clicked object by using the pickBuffer.

  In this simple demo, we store the ID in the red channel of the pixel in the
  pickBuffer. However, this means that only 255 objects are possible.
  But you can get around this by packing the id into all the 4 channels of the RGBA
  pixel. But to keep things simple, we refrain from doing this.
 */
const pickBuffer = regl.framebuffer({
  colorType: 'uint8',
  colorFormat: 'rgba'
})

//
// Create plane geometry
//

const planeElements = []
var planePosition = []
var planeNormal = []

planePosition.push([-0.5, 0.0, -0.5])
planePosition.push([+0.5, 0.0, -0.5])
planePosition.push([-0.5, 0.0, +0.5])
planePosition.push([+0.5, 0.0, +0.5])

planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])
planeNormal.push([0.0, 1.0, 0.0])

planeElements.push([3, 1, 0])
planeElements.push([0, 2, 3])

//
// Create box geometry.
//

var boxPosition = [
  // side faces
  [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
  [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
  [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
  [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
  [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5],  // top face
  [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]  // bottom face
]

const boxElements = [
  [2, 1, 0], [2, 0, 3],
  [6, 5, 4], [6, 4, 7],
  [10, 9, 8], [10, 8, 11],
  [14, 13, 12], [14, 12, 15],
  [18, 17, 16], [18, 16, 19],
  [20, 21, 22], [23, 20, 22]
]

// all the normals of a single block.
var boxNormal = [
  // side faces
  [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0],
  [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0],
  [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0],
  [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0],
  // top
  [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0],
  // bottom
  [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0]
]

// keeps track of all global state.
const globalScope = regl({
  uniforms: {
    lightDir: [0.39, 0.87, 0.29],
    view: () => viewMatrix,
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective(projectionMatrix,
                       Math.PI / 4,
                       viewportWidth / viewportHeight,
                       0.01,
                       1000)
  }
})

// render object with phong shading.
const drawNormal = regl({
  frag: `
  precision mediump float;

  varying vec3 vNormal;
  varying vec3 vPosition;

  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 color;
  uniform vec3 lightDir;

  void main () {
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir);
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    gl_FragColor = vec4((ambient + diffuse), 1.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  varying vec3 vPosition;
  varying vec3 vNormal;

  uniform mat4 projection, view, model;

  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);

    vPosition = worldSpacePosition.xyz;
    vNormal = normal;

    gl_Position = projection * view * worldSpacePosition;
  }`
})

// everything rendered in this scope is rendered to the pickbuffer.
const pickBufferWrite = regl({
  framebuffer: pickBuffer
})

//
// Simple shader that only outputs the id of the rendered object at
// every fragment.
//
const writeId = regl({
  frag: `
  precision mediump float;

  uniform float id;

  void main () {
    gl_FragColor = vec4(vec3(id / 255.0, 0.0, 0.0), 1.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  uniform mat4 projection, view, model;

  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);
    gl_Position = projection * view * worldSpacePosition;
  }`,

  uniforms: {
    id: regl.prop('id')
  }
})

// render the object slightly bigger than it should be.  this is used
// to draw the outline.  but we don't write to the depth buffer.  this
// allows us to draw the object(that we wish to draw the outline for)
// onto the slightly bigger object, thus forming the outine.
const drawOutline = regl({
  frag: `
  precision mediump float;

  void main () {
    gl_FragColor = vec4(vec3(0.7, 0.6, 0.0), 1.0);
  }`,
  vert: `
  precision mediump float;

  attribute vec3 position;
  attribute vec3 normal;

  uniform mat4 projection, view, model;
  uniform bool isRound;

  void main() {
    float s = 0.19;
    vec4 worldSpacePosition = model * vec4(
      // for objects with lots of jagged edges, the ususal approach doesn't work.
      // We use an alternative way of enlarging the object for such objects.
      isRound ? (position + normal * s) : (position * (0.3*s+1.0)),
      1);
    gl_Position = projection * view * worldSpacePosition;
  }`,

  depth: {
    enable: true,
    mask: false // DONT write to depth buffer!
  }
})

function Mesh (elements, position, normal) {
  this.elements = elements
  this.position = position
  this.normal = normal
}

function createModelMatrix (props) {
  var m = mat4.identity([])

  mat4.translate(m, m, props.translate)

  var s = props.scale
  mat4.scale(m, m, [s, s, s])

  return m
}

Mesh.prototype.draw = regl({
  uniforms: {
    model: (_, props, batchId) => {
      return createModelMatrix(props)
    },
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7,
    color: regl.prop('color'),
    isRound: regl.prop('isRound')
  },
  attributes: {
    position: regl.this('position'),
    normal: regl.this('normal')
  },
  elements: regl.this('elements'),
  cull: {
    enable: true
  }
})

var bunnyMesh = new Mesh(bunny.cells, bunny.positions, normals(bunny.cells, bunny.positions))
var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)
var planeMesh = new Mesh(planeElements, planePosition, planeNormal)

var meshes = [
  {scale: 80.0, translate: [0.0, 0.0, 0.0], color: [0.5, 0.5, 0.5], mesh: planeMesh},

  {scale: 0.2, translate: [0.0, 0.0, 0.0], color: [0.6, 0.0, 0.0], mesh: bunnyMesh},
  {scale: 0.3, translate: [-6.0, 0.0, -3.0], color: [0.6, 0.6, 0.0], mesh: bunnyMesh},
  {scale: 0.16, translate: [3.0, 0.0, 2.0], color: [0.2, 0.5, 0.6], mesh: bunnyMesh},

  {scale: 2.0, translate: [4.0, 1.0, 0.0], color: [0.6, 0.0, 0.0], mesh: boxMesh},
  {scale: 1.3, translate: [-3.0, 0.6, -4.0], color: [0.0, 0.6, 0.0], mesh: boxMesh},
  {scale: 0.7, translate: [-3.0, 0.5, 4.0], color: [0.0, 0.0, 0.8], mesh: boxMesh}
]

var iSelectedMesh = -1

// will be null, if mouse was not clicked this frame.
// otherwise, it will contain the clicked mouse position.
var clickedPos = null

mb.on('down', function () {
  clickedPos = [mp[0], mp[1]]
})

regl.frame(({viewportWidth, viewportHeight}) => {
  pickBuffer.resize(viewportWidth, viewportHeight)

  globalScope(() => {
    // first render to the pickBuffer.
    pickBufferWrite(() => {
      regl.clear({
        color: [0, 0, 0, 255],
        depth: 1
      })
      for (var i = 0; i < meshes.length; i++) {
        m = meshes[i]
        if (m !== planeMesh) { // do not allow clicking on the plane.
          writeId({id: i}, () => {
            m.mesh.draw(m)
          })
        }
      }
    })

    // then we render normally.
    regl.clear({
      color: [0, 0, 0, 255],
      depth: 1
    })

    var m
    for (var i = 0; i < meshes.length; i++) {
      m = meshes[i]
      if (i !== iSelectedMesh) {
        // if not selected, draw object normally.
        drawNormal(() => {
          m.mesh.draw(m)
        })
      }
    }

    // we need to render the selected object last.
    if (iSelectedMesh !== -1) {
      m = meshes[iSelectedMesh]

      drawOutline(() => {
        m.isRound = (m.mesh !== boxMesh)
        m.mesh.draw(m)
      })

      // then draw object normally.
      drawNormal(() => {
        m.mesh.draw(m)
      })
    }
  })

  // last, we handle object picking logic.
  if (clickedPos !== null) {
    // first, read from pickBuffer
    var pixels
    regl({framebuffer: pickBuffer})(() => {
      pixels = regl.read()
    })

    // get id at clicked position.
    var clickId = pixels[(canvas.width * (canvas.height - clickedPos[1]) + clickedPos[0]) * 4]

    if (clickId !== 0) { // empty pixels are 0. Because they are not written to.
      iSelectedMesh = clickId
    }
    clickedPos = null
  }
})
