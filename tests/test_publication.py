"""The independent-tool exception must not relax source/privacy checks."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from verify_publication import inspect,HOME_PATH

class PublicationTests(unittest.TestCase):
    def test_sources_still_reject_binaries_and_credentials(self):
        for data in [bytes([0,97,115,109,1,0,0,0]),bytes([127,69,76,70,1,1,1]),
                     b'ghp_'+b'A'*36]:
            with self.assertRaises(ValueError):inspect('source.mjs',data)

    def test_paths_stop_at_string_boundaries(self):
        self.assertIsNone(HOME_PATH.search(b'FS.mkdir("/home/web_user");FS.mkdir("/dev")'))
        self.assertIsNone(HOME_PATH.search(b'/home/'+b'web_user'+bytes([0])+b'/dev'+bytes([0])))
        for data in [('/'+'home/'+'example/'+'private.cpp').encode(),
                     ('C:'+chr(92)+'Users'+chr(92)+'example'+chr(92)+'private.cpp').encode()]:
            with self.assertRaises(ValueError):inspect('source.mjs',data)

if __name__=='__main__':unittest.main()
