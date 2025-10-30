'use client'

export default function StarryBackground() {
  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Stars layer 1 - Small stars */}
        <div className="stars-small" />
        {/* Stars layer 2 - Medium stars */}
        <div className="stars-medium" />
        {/* Stars layer 3 - Large stars */}
        <div className="stars-large" />
      </div>

      <style jsx>{`
        .stars-small,
        .stars-medium,
        .stars-large {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: transparent;
        }

        /* Small stars - Static */
        .stars-small {
          box-shadow:
            179px 1235px #fff,
            1289px 1123px #fff,
            1440px 1585px #fff,
            779px 450px #fff,
            1119px 1023px #fff,
            1680px 567px #fff,
            1519px 1343px #fff,
            1239px 879px #fff,
            1859px 1203px #fff,
            359px 123px #fff,
            679px 1823px #fff,
            999px 1523px #fff,
            1299px 723px #fff,
            1619px 1923px #fff,
            259px 1423px #fff,
            1839px 223px #fff,
            1759px 1723px #fff,
            1079px 323px #fff,
            1519px 1023px #fff,
            779px 1623px #fff,
            1179px 1223px #fff,
            359px 823px #fff,
            1679px 1523px #fff,
            959px 1823px #fff,
            1359px 423px #fff,
            659px 1123px #fff,
            1759px 723px #fff,
            279px 1323px #fff,
            1559px 1623px #fff,
            879px 523px #fff,
            1179px 1423px #fff,
            1679px 1023px #fff,
            479px 1723px #fff,
            1359px 223px #fff,
            959px 1523px #fff,
            179px 623px #fff,
            1459px 1823px #fff,
            779px 1223px #fff,
            1679px 323px #fff,
            359px 1423px #fff,
            1079px 723px #fff,
            1759px 1123px #fff,
            559px 1923px #fff,
            1359px 823px #fff,
            879px 1623px #fff,
            1559px 423px #fff,
            259px 1023px #fff,
            1679px 1723px #fff,
            679px 223px #fff,
            1179px 1523px #fff,
            1459px 1323px #fff,
            959px 923px #fff,
            379px 1823px #fff,
            1759px 523px #fff,
            779px 1423px #fff,
            1359px 1123px #fff,
            179px 1723px #fff,
            1079px 1223px #fff,
            1559px 823px #fff,
            559px 1523px #fff,
            1679px 623px #fff,
            879px 323px #fff,
            1459px 1623px #fff,
            259px 1923px #fff,
            1759px 1323px #fff,
            679px 423px #fff,
            1179px 1023px #fff,
            1359px 1723px #fff,
            959px 223px #fff,
            1679px 1823px #fff,
            479px 723px #fff,
            1079px 1423px #fff,
            1559px 1123px #fff,
            179px 523px #fff,
            1759px 1923px #fff,
            779px 623px #fff,
            1359px 1323px #fff,
            879px 1023px #fff,
            1459px 423px #fff,
            559px 1723px #fff,
            1679px 1223px #fff,
            259px 823px #fff,
            1179px 1623px #fff,
            959px 1123px #fff,
            1679px 323px #fff,
            379px 1523px #fff,
            1079px 1823px #fff,
            1759px 223px #fff,
            779px 1923px #fff,
            1359px 623px #fff,
            1559px 1423px #fff,
            179px 1123px #fff,
            1459px 1723px #fff,
            659px 1023px #fff,
            1179px 323px #fff,
            1679px 1523px #fff,
            879px 723px #fff,
            1759px 1623px #fff,
            359px 1223px #fff,
            959px 1423px #fff,
            1359px 523px #fff,
            679px 1823px #fff,
            1559px 223px #fff;
          width: 1px;
          height: 1px;
          opacity: 0.4;
        }

        /* Medium stars - Static */
        .stars-medium {
          box-shadow:
            1679px 1123px #fff,
            979px 1523px #fff,
            1279px 423px #fff,
            479px 1823px #fff,
            1779px 723px #fff,
            779px 1323px #fff,
            1179px 223px #fff,
            1579px 1623px #fff,
            379px 923px #fff,
            979px 1223px #fff,
            1479px 523px #fff,
            679px 1723px #fff,
            1779px 1023px #fff,
            879px 1423px #fff,
            1379px 323px #fff,
            579px 1923px #fff,
            1679px 823px #fff,
            279px 1123px #fff,
            1079px 1523px #fff,
            1479px 623px #fff,
            779px 1823px #fff,
            1779px 423px #fff,
            379px 1223px #fff,
            979px 723px #fff,
            1579px 1323px #fff,
            679px 223px #fff,
            1179px 1623px #fff,
            1379px 1023px #fff,
            579px 1723px #fff,
            1679px 523px #fff,
            879px 1423px #fff,
            1279px 923px #fff,
            479px 1923px #fff,
            1779px 1223px #fff,
            779px 323px #fff,
            1079px 1123px #fff,
            1479px 1523px #fff,
            179px 823px #fff,
            1679px 1623px #fff,
            979px 423px #fff,
            1379px 1823px #fff,
            679px 723px #fff,
            1779px 1323px #fff,
            379px 1023px #fff,
            1179px 1723px #fff,
            1579px 223px #fff,
            879px 1923px #fff,
            1279px 623px #fff,
            479px 1423px #fff,
            1679px 1123px #fff;
          width: 2px;
          height: 2px;
          opacity: 0.5;
        }

        /* Large stars - Static */
        .stars-large {
          box-shadow:
            1479px 923px #fff,
            879px 1323px #fff,
            1179px 523px #fff,
            579px 1623px #fff,
            1679px 223px #fff,
            379px 1823px #fff,
            979px 723px #fff,
            1379px 1123px #fff,
            779px 1523px #fff,
            1779px 423px #fff,
            479px 1223px #fff,
            1079px 1723px #fff,
            1579px 823px #fff,
            279px 1423px #fff,
            1679px 623px #fff,
            879px 1023px #fff,
            1279px 1823px #fff,
            679px 323px #fff,
            1779px 1623px #fff,
            1079px 1123px #fff,
            479px 1523px #fff,
            1379px 723px #fff,
            779px 1923px #fff,
            1679px 1323px #fff,
            379px 523px #fff,
            979px 1223px #fff,
            1579px 1723px #fff,
            179px 923px #fff,
            1479px 1423px #fff,
            879px 223px #fff;
          width: 3px;
          height: 3px;
          opacity: 0.6;
        }

        /* Reduce opacity on mobile for better visibility */
        @media (max-width: 768px) {
          .stars-small {
            opacity: 0.3;
          }
          .stars-medium {
            opacity: 0.4;
          }
          .stars-large {
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  )
}

