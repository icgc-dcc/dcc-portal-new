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

(function () {
  'use strict';

  var module = angular.module('icgc.common.notify', []);

  module.factory('Notify', function ($location, Page) {
    var visible = false,
      removable = true,
      error = false,
      message = '',
      theme = '',
      link = '',
      linkText = '',
      dismissAction = () => {
        //no-op
      };
    
    let params = {};

    const isVisible = () => !!visible;

    const show = () => {visible = true};

    const showErrors = () => {
      // Portal convention
      Page.setError(true);
      error = true;
      visible = true;
    };

    const hide = () => {
      visible = false;
      if (error === true) {
        error = false;
        Page.setError(false);
        Page.stopAllWork();
      }
    };

    const redirectHome = () => {
      visible = false;
      if (error === true) {
        error = false;
        Page.setError(false);
        Page.stopAllWork();
        $location.path('/').search({});
      }
    };

    const setMessage = (m) => {
      if (!angular.isDefined(m)) throw new Error('Notify requires a message');
      if (!angular.isString(m)) throw new Error('msg must be a string');
      message = m;
    };

    const setParams = (response) => {
      if(!_.isEmpty(response)){
        params.headers = response.headers();
        params.source = response.config.url;
        params.message = response.data.message || response.statusText;
      }
    };

    const getParams = () => params;

    const getMessage = () => message;

    const isError = () => error;

    const isRemovable = () => !!removable;

    const setRemovable = (r) => {
      if (angular.isDefined(r) && typeof r !== 'boolean') throw new Error('r must be a boolean');
      removable = r;
    };

    const setTheme = (t) => {theme = t};

    const getTheme = () => theme;

    const setDismissAction = (func) => {
      dismissAction = func;
    };

    const dismiss = () => {
      visible = false;
      dismissAction();
    };

    const setLink = (l) => {link = l};

    const getLink = () => link;

    const setLinkText = (l) => {linkText = l};

    const getLinkText = () => linkText;

    return {
      isVisible,
      show,
      showErrors,
      hide,
      redirectHome,
      setParams,
      getParams,
      setMessage,
      getMessage,
      setRemovable,
      isRemovable,
      setTheme,
      getTheme,
      isError,
      setDismissAction,
      dismiss,
      setLink,
      getLink,
      setLinkText,
      getLinkText
    };
  });

  module.controller('NotifyCtrl', function ($scope, Page, Notify) {
    $scope.notify = Notify;
    $scope.responseParams = $scope.notify.getParams();

    $scope.$on('$locationChangeSuccess', function() {
      if (Notify.isVisible() && Page.page() !== 'error') {
        Notify.hide();
      }
    });
  });

  module.directive('notify', function () {
    return {
      restrict: 'E',
      replace: true,
      controller: 'NotifyCtrl',
      scope: true,
      templateUrl: 'scripts/common/views/notify.html'
    };
  });
})();
