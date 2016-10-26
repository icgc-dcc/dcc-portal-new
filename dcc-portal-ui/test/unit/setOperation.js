/*
 * Copyright 2016(c) The Ontario Institute for Cancer Research. All rights reserved.
 *
 * This program and the accompanying materials are made available under the terms of the GNU Public
 * License v3.0. You should have received a copy of the GNU General Public License along with this
 * program. If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
 * WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
const innertext = require('innertext');

describe('Test SetOperationService', function() {
  var SetOperationService;

  beforeEach(module('icgc'));

  beforeEach(inject(function ($httpBackend, $q, $rootScope, _SetOperationService_) {
    window._gaq = [];
    SetOperationService= _SetOperationService_;
  }));

  it('Test set equal operation', function() {
     expect(SetOperationService.isEqual(['a', 'b'], ['a', 'b'])).toEqual(true);
     expect(SetOperationService.isEqual(['a', 'b'], ['b', 'a'])).toEqual(true);
     expect(SetOperationService.isEqual(['a', 'b'], ['a', 'a'])).toEqual(false);
     expect(SetOperationService.isEqual(['a', 'b'], ['a', 'b', 'c'])).toEqual(false);
  });

  it('Test set operation alias', function() {
     expect(innertext(SetOperationService.getSetShortHand('a', ['b', 'a', 'c']))).toEqual('S2');
     expect(innertext(SetOperationService.getSetShortHand('a', ['a', 'b', 'c']))).toEqual('S1');
  });

});

