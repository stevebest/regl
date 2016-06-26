const regl = require('../regl')()
const perspective = require('gl-mat4/perspective')
const lookAt = require('gl-mat4/lookAt')
const identity = require('gl-mat4/identity')
const rotate = require('gl-mat4/rotate')
const normals = require('angle-normals')
const mouse = require('mouse-change')()

require('resl')({
  manifest: {
    'skeleton': {
      type: 'text',
      src: 'assets/skeleton.json',
      parser: JSON.parse
    }
  },

  onDone: ({skeleton: {boneIds, positions, cells}}) => {
    const NUM_BONES = 23

    const pose = new Float32Array(NUM_BONES * 4 * 4)
    for (var i = 0; i < NUM_BONES; ++i) {
      const M = pose.subarray(16 * i, 16 * (i + 1))
      identity(M)
      rotate(
        M, M,
        Math.random() * 0.2,
        [Math.random(), Math.random(), Math.random()])
    }

    const poseTexture = regl.texture({
      shape: [4, NUM_BONES, 4],
      data: pose
    })

    const drawSkeleton = regl({
      frag: `
      precision highp float;
      varying vec3 fragNormal;
      void main () {
        gl_FragColor = vec4(fragNormal + 0.5, 1);
      }`,

      vert: `
      precision highp float;
      attribute vec3 position, normal;
      attribute float boneId;
      uniform mat4 projection, view;
      uniform sampler2D pose;
      varying vec3 fragNormal;

      void main () {
        float row = boneId / float(${NUM_BONES});
        mat4 model = mat4(
          texture2D(pose, vec2(0.05, row)),
          texture2D(pose, vec2(0.3, row)),
          texture2D(pose, vec2(0.55, row)),
          texture2D(pose, vec2(0.8, row)));

        fragNormal = normal;
        gl_Position = projection * view * model * vec4(position, 1);
      }`,

      uniforms: {
        projection: ({viewportWidth, viewportHeight}) =>
          perspective([],
            Math.PI / 4,
            viewportWidth / viewportHeight,
            0.01,
            1000),
        view: ({viewportWidth, viewportHeight, pixelRatio}) => {
          const {x, y} = mouse
          return lookAt([],
            [ 100.0 * (pixelRatio * x / viewportWidth - 0.5),
              100.0 * (0.5 - pixelRatio * y / viewportHeight) + 20.0,
              50 ],
            [0, 20, 0],
            [0, 1, 0])
        },
        pose: poseTexture
      },

      attributes: {
        normal: normals(cells, positions),
        boneId: boneIds,
        position: positions
      },

      elements: cells
    })

    regl.frame(() => {
      regl.clear({
        color: [0, 0, 0, 1],
        depth: 1
      })

      for (var i = 0; i < NUM_BONES; ++i) {
        const M = pose.subarray(16 * i, 16 * (i + 1))
        identity(M)
        rotate(
          M, M,
          Math.random() * 0.2 - 0.1,
          [Math.random(), Math.random(), Math.random()])
      }
      poseTexture({
        shape: [4, NUM_BONES, 4],
        data: pose
      })

      drawSkeleton()
    })
  }
})
